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

// To-Do's:
// 1. replace arena with bump allocator. no need to free and do 2 mb?
#define PUBKEY_SIZE 32
#define SIGNATURE_SIZE 64
#define MAX_RECORDS 100
/// start address of the memory region used for program heap
#define HEAP_START_ADDRESS_ (uint64)0x300000000
/// len of the heap memory region used for program heap - currently 500 kbs - need 3mb?
#define HEAP_LENGTH_ (uint64)(500 * 1024)

// MAP_ANONYMOUS is not defined on Mac OS X and some other UNIX systems.
#ifndef MAP_ANONYMOUS
#define MAP_ANONYMOUS MAP_ANON
#endif

// To-Do's:
// 1. simple .txt db to store rolling 30 day data on ZiG and others
// 1.b. expose endpoint to frontend to fetch db data
// 2. custom file reading

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

// bump allocator
// typedef struct bump_allocator
// {
    // uint64 start;
    // uint64 size;
// } bump_allocator;
// 
// void *alloc(bump_allocator *self, uint64 size, uint64 align)
// {
    // uint64 *pos_ptr = (uint64 *)self->start;
// 
    // uint64 pos = *pos_ptr;
    // if (pos == 0)
    // {
        // // first time, set starting position
        // pos = self->start + self->size;
    // }
// 
    // if (pos < size)
    // {
        // pos = 0;
    // }
    // else
    // {
        // pos = pos - size;
    // }
// 
    // // ptr alignment wizardry with bit AND and NOT
    // pos &= ~(align - 1);
// 
    // if (pos < self->start + sizeof(uint8))
    // {
        // return NULL;
    // }
// 
    // *pos_ptr = pos;
    // return (void *)pos;
// }

// allocator usage
// void entrypoint(void)
// {
    // bump_allocator heap = {HEAP_START_ADDRESS_, HEAP_LENGTH_};
    // assert(0 != alloc(&heap, 1, sizeof(uint64)));
    // printf("No need to free, I'm a bump allocator master weasel");
// }

typedef struct Arena
{
    uint8 *base;
    uint8 *used;
    uint64 size;
} Arena;

Arena *create_arena(uint64 size)
{
    Arena *arena = (Arena *)mmap(NULL, sizeof(Arena) + size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (arena == MAP_FAILED)
    {
        perror("mmap");
        exit(EXIT_FAILURE);
    }
    arena->base = (uint8 *)(arena + 1);
    arena->used = arena->base;
    arena->size = size;
    return arena;
}

void *arena_allocate(Arena *arena, uint64 size)
{
    if (arena->used + size > arena->base + arena->size)
    {
        fprintf(stderr, "Not enough space in arena: requested %zu bytes, %zu bytes available\n", size, arena->size - (arena->used - arena->base));
        return NULL;
    }
    uint8 *new_used = arena->used;
    arena->used += size;
    // fprintf(stderr, "Allocated %zu bytes, %zu bytes remaining\n", size, arena->size - (arena->used - arena->base));
    return new_used;
}

void arena_reset(Arena *arena)
{
    arena->used = arena->base;
    // fprintf(stderr, ">> Arena memory reset\n");
}

void arena_release(Arena *arena)
{
    if (munmap(arena, sizeof(Arena) + arena->size) == -1)
    {
        perror("munmap");
        exit(EXIT_FAILURE);
    }
}

void send_full_res(int newsockfd, uint8 *content, uint8 *content_type, uint64 content_length)
{
    uint8 header[1024];
    snprintf(header, sizeof(header), "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %zu\r\n\r\n", content_type, content_length);
    write(newsockfd, header, custom_strlen_cacher(header));
    write(newsockfd, content, content_length);
}

void read_file(Arena *arena, int newsockfd, uint8 *uri)
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
    // printf("Attempting to open file: %s\n", filepath);

    FILE *fp = fopen(filepath, "rb");
    if (!fp)
    {
        perror("fopen");
        uint8 *not_found = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: 13\r\n\r\n404 Not Found";
        write(newsockfd, not_found, custom_strlen_cacher(not_found));
        return;
    }

    fseek(fp, 0, SEEK_END);
    uint64 file_size = ftell(fp);
    fseek(fp, 0, SEEK_SET);

    uint8 *buffer = (uint8 *)arena_allocate(arena, file_size);
    if (!buffer)
    {
        perror("arena_allocate");
        fclose(fp);
        return;
    }

    uint64 bytes_read = fread(buffer, 1, file_size, fp);
    fclose(fp);

    if (bytes_read != file_size)
    {
        perror("fread");
        return;
    }

    uint8 *content_type = "text/html"; // default content type
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

void handle_client(Arena *arena, int newsockfd)
{
    uint8 buffer[BUFFER_SIZE];
    int valread = read(newsockfd, buffer, BUFFER_SIZE);
    if (valread < 0)
    {
        perror("read");
        close(newsockfd);
        return;
    }

    buffer[valread] = '\0'; // ensure null-terminated string

    uint8 method[BUFFER_SIZE], uri[BUFFER_SIZE], version[BUFFER_SIZE];
    sscanf(buffer, "%s %s %s", method, uri, version);
    // printf("Client request: %s %s %s\n", method, uri, version);

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
    signal(SIGPIPE, SIG_IGN); // ignore SIGPIPE signals

    Arena *arena = create_arena(60 * 1024 * 1024); // 60MB
    int sockfd = setup_server();
    printf("Server listening on http://localhost:%d\n", PORT);

    int request_count = 0;
    const int max_requests_before_reset = 10;

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
        request_count++;

        if (request_count >= max_requests_before_reset)
        {
            arena_reset(arena);
            request_count = 0;
        }
    }

    close(sockfd);
    arena_release(arena);
    return 0;
}

