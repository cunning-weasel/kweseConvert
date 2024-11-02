#include <arpa/inet.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <signal.h>
#include <string.h>
#include <assert.h>
#include <time.h>
#include <sys/socket.h>
#include <sys/mman.h>
#include <bits/mman-linux.h>

typedef signed char int8;
typedef short int16;
typedef int int32;
typedef long long int64;
typedef unsigned char uint8;
typedef unsigned short uint16;
typedef unsigned int uint32;
typedef unsigned long long uint64;
typedef int32 bool32;
typedef float real32;
typedef double real64;
typedef enum bool
{
    false,
    true
} bool;

#define PORT 8080
#define BUFFER_SIZE 600
#define PATH_MAX 4096

// bump allocator conf
#define HEAP_START_ADDRESS (uint64)0x300000000
#define HEAP_LENGTH (uint64)(2 * 1024 * 1024) // 2MB per request

#ifndef MAP_ANONYMOUS
#define MAP_ANONYMOUS MAP_ANON
#endif

typedef struct
{
    uint64 start;
    uint64 size;
    uint64 position;
} bump_allocator;

uint64 weasel_len(uint8 *string)
{
    uint8 *p = string;
    uint64 len = 0;

    while (*p)
    {
        len++;
        p++;
    }
    return len;
}

uint64 custom_strlen_cacher(uint8 *str)
{
    static uint8 *start = NULL;
    static uint8 *end = NULL;
    uint64 len = 0;
    uint64 cap = 10000;

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

void *bump_alloc(bump_allocator *alloc, uint64 size, uint64 align)
{
    // align the position
    uint64 aligned_pos = (alloc->position + align - 1) & ~(align - 1);

    // check if we have enough space
    if (aligned_pos + size > alloc->size)
    {
        return NULL;
    }

    // advance position and return pointer
    alloc->position = aligned_pos + size;
    return (void *)(alloc->start + aligned_pos);
}

void send_full_res(int newsockfd, uint8 *content, uint8 *content_type, uint64 content_length)
{
    uint8 header[1024];
    snprintf(header, sizeof(header),
             "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %llu\r\n\r\n",
             content_type, content_length);
    write(newsockfd, header, custom_strlen_cacher(header));
    write(newsockfd, content, content_length);
}

void read_file(bump_allocator *alloc, int newsockfd, uint8 *uri)
{
    if (custom_strlen_cacher(uri) == 0 || (custom_strlen_cacher(uri) == 1 && uri[0] == '/'))
    {
        strcpy(uri, "/index.html");
    }

    if (uri[0] != '/')
    {
        uint8 temp_uri[BUFFER_SIZE];
        snprintf(temp_uri, sizeof(temp_uri), "/%s", uri);
        strcpy(uri, temp_uri);
    }

    uint8 filepath[PATH_MAX];
    snprintf(filepath, sizeof(filepath), "index%s", uri);

    FILE *fp = fopen(filepath, "rb");
    if (!fp)
    {
        uint8 *not_found = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: 13\r\n\r\n404 Not Found";
        write(newsockfd, not_found, custom_strlen_cacher(not_found));
        return;
    }

    fseek(fp, 0, SEEK_END);
    uint64 file_size = ftell(fp);
    fseek(fp, 0, SEEK_SET);

    uint8 *buffer = bump_alloc(alloc, file_size, sizeof(uint64));
    if (!buffer)
    {
        fclose(fp);
        return;
    }

    uint64 bytes_read = fread(buffer, 1, file_size, fp);
    fclose(fp);

    if (bytes_read != file_size)
    {
        return;
    }

    uint8 *content_type = "text/html";
    if (strstr(uri, ".js"))
    {
        content_type = "text/javascript";
    }
    else if (strstr(uri, ".json"))
    {
        content_type = "application/json";
    }
    else if (strstr(uri, ".png"))
    {
        content_type = "image/png";
    }
    else if (strstr(uri, ".css"))
    {
        content_type = "text/css";
    }
    else if (strstr(uri, ".svg"))
    {
        content_type = "image/svg+xml";
    }
    else if (strstr(uri, ".ico"))
    {
        content_type = "image/x-icon";
    }

    send_full_res(newsockfd, buffer, content_type, file_size);
}

void handle_client(bump_allocator *alloc, int newsockfd)
{
    // reset position for new request
    alloc->position = 0;

    uint8 buffer[BUFFER_SIZE];
    int valread = read(newsockfd, buffer, BUFFER_SIZE);
    if (valread < 0)
    {
        perror("read");
        close(newsockfd);
        return;
    }

    buffer[valread] = '\0';

    uint8 method[BUFFER_SIZE], uri[BUFFER_SIZE], version[BUFFER_SIZE];
    sscanf(buffer, "%s %s %s", method, uri, version);

    read_file(alloc, newsockfd, uri);
    close(newsockfd);
}

int setup_server(void)
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

int main(void)
{
    signal(SIGPIPE, SIG_IGN);

    // init memory mapping for heap
    void *heap = mmap(
        (void *)HEAP_START_ADDRESS,
        HEAP_LENGTH,
        PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED,
        -1,
        0);

    if (heap == MAP_FAILED)
    {
        perror("mmap");
        exit(EXIT_FAILURE);
    }

    // init bump allocator
    bump_allocator alloc = {
        .start = (uint64)heap,
        .size = HEAP_LENGTH,
        .position = 0};

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

        handle_client(&alloc, newsockfd);
    }

    // should never reach here, but never say weasel?
    close(sockfd);
    munmap(heap, HEAP_LENGTH);
    return 0;
}
