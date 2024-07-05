#include <arpa/inet.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <signal.h>
#include <string.h>

#include <time.h>
#include <sys/socket.h>
#include <sys/mman.h>
#include <bits/mman-linux.h>

#define PORT 8080
#define BUFFER_SIZE 600
#define PATH_MAX 4096

size_t weasel_len(char *string)
{
    char *p = string;
    size_t len = 0;

    while (*p)
    {
        len++;
        p++;
    }
    return len;
}

size_t custom_strlen_cacher(char *str)
{
    static char *start = NULL;
    static char *end = NULL;
    size_t len = 0;
    size_t cap = 10000;

    if (start && str >= start && str <= end)
    {
        len = end - str;
        return len;
    }

    len = weasel_len(str);

    if (len > cap)
    {
        start = str;
        end = str + len;
    }

    return len;
}

typedef struct Arena
{
    char *base;
    char *used;
    size_t size;
} Arena;

Arena *create_arena(size_t size)
{
    Arena *arena = (Arena *)mmap(NULL, sizeof(Arena) + size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (arena == MAP_FAILED)
    {
        perror("mmap");
        exit(EXIT_FAILURE);
    }
    arena->base = (char *)(arena + 1);
    arena->used = arena->base;
    arena->size = size;
    return arena;
}

void *arena_allocate(Arena *arena, size_t size)
{
    if (arena->used + size > arena->base + arena->size)
    {
        perror("Not enough space in arena");
        return NULL;
    }
    char *new_used = arena->used;
    arena->used += size;
    return new_used;
}

void arena_release(Arena *arena)
{
    if (munmap(arena, sizeof(Arena) + arena->size) == -1)
    {
        perror("munmap");
        exit(EXIT_FAILURE);
    }
}

void send_full_res(int newsockfd, char *content, char *content_type, size_t content_length)
{
    char header[1024];
    snprintf(header, sizeof(header), "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %zu\r\n\r\n", content_type, content_length);
    write(newsockfd, header, custom_strlen_cacher(header));
    write(newsockfd, content, content_length);
}

void read_file(Arena *arena, int newsockfd, char *uri)
{
    if (custom_strlen_cacher(uri) == 0 || (custom_strlen_cacher(uri) == 1 && uri[0] == '/'))
    {
        strcpy(uri, "/index.html");
    }

    if (uri[0] != '/')
    {
        char temp_uri[BUFFER_SIZE];
        snprintf(temp_uri, sizeof(temp_uri), "/%s", uri);
        strcpy(uri, temp_uri);
    }

    char filepath[PATH_MAX];
    snprintf(filepath, sizeof(filepath), "index%s", uri);

    printf("Attempting to open file: %s\n", filepath); 

    FILE *fp = fopen(filepath, "rb");
    if (fp)
    {
        fseek(fp, 0, SEEK_END);
        size_t file_size = ftell(fp);
        fseek(fp, 0, SEEK_SET);

        char *buffer = (char *)arena_allocate(arena, file_size);
        if (!buffer)
        {
            perror("arena_allocate");
            fclose(fp);
            return;
        }

        size_t bytes_read = fread(buffer, 1, file_size, fp);
        fclose(fp);

        if (bytes_read != file_size)
        {
            perror("fread");
            return;
        }

        char *content_type = "text/html"; // default content type
        if (strstr(uri, ".js"))
        {
            content_type = "text/javascript";
        }
        else if (strstr(uri, ".json"))
        {
            content_type = "application/json";
        }

        send_full_res(newsockfd, buffer, content_type, file_size);
    }
    else
    {
        perror("fopen");
    }
}

void handle_client(Arena *arena, int newsockfd)
{
    char buffer[BUFFER_SIZE];
    int valread = read(newsockfd, buffer, BUFFER_SIZE);
    if (valread < 0)
    {
        perror("read");
        close(newsockfd);
        return;
    }

    char method[BUFFER_SIZE], uri[BUFFER_SIZE], version[BUFFER_SIZE];
    sscanf(buffer, "%s %s %s", method, uri, version);

    read_file(arena, newsockfd, uri);
    close(newsockfd);
}

int setup_server()
{
    int sockfd = socket(AF_INET, SOCK_STREAM, 0);
    if (sockfd == -1)
    {
        perror("socket");
        exit(EXIT_FAILURE);
    }

    int enable = 1;
    if (setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, &enable, sizeof(int)) < 0)
    {
        perror("setsockopt(SO_REUSEADDR)");
        close(sockfd);
        exit(EXIT_FAILURE);
    }

    struct sockaddr_in host_addr = {
        .sin_family = AF_INET,
        .sin_port = htons(PORT),
        .sin_addr.s_addr = htonl(INADDR_ANY)};

    if (bind(sockfd, (struct sockaddr *)&host_addr, sizeof(host_addr)) != 0)
    {
        perror("bind");
        close(sockfd);
        exit(EXIT_FAILURE);
    }

    if (listen(sockfd, SOMAXCONN) != 0)
    {
        perror("listen");
        close(sockfd);
        exit(EXIT_FAILURE);
    }

    return sockfd;
}

int main()
{
    Arena *arena = create_arena(500 * 1024 * 1024); // 500MB
    int sockfd = setup_server();
    printf("Server listening on http://localhost:%d\n", PORT);

    while (1)
    {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        int newsockfd = accept(sockfd, (struct sockaddr *)&client_addr, &client_len);

        if (newsockfd < 0)
        {
            perror("accept");
            continue;
        }

        handle_client(arena, newsockfd);
    }

    close(sockfd);
    arena_release(arena);
    return 0;
}
