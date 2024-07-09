#!/bin/bash
echo "Compile option master weasel:"
echo "[1] Debug"
echo "[2] Debug 64-bit"
echo "[3] Regular compile"
echo "[4] Optimized compile"
read -p "Enter your cunning choice: " choice

compile_and_execute() {
    gcc -o output_weasel_server weasel_server.c "$@"
    if [ $? -eq 0 ]; then
        ./output_weasel_server
    else
        echo "big shit on compilation"
    fi
}

case $choice in
    1) gcc -o output_weasel_server weasel_server.c -g -Og -Wall -Wextra -Wpedantic -Og -g3 -fsanitize=address,undefined ;;
    2) gcc -o output_weasel_server weasel_server.c -g -Og -Wall -Wextra -Wpedantic -Og -g3 -fsanitize=address,undefined -m64 ;;
    3) gcc -o output_weasel_server weasel_server.c ;;
    4) gcc -o output_weasel_server weasel_server.c -O3 ;;
    *) echo "Invalid option" ;;
esac

compile_and_execute

# # simple alternative:
# CommonFlags="-Wall -Werror -Wno-write-strings -Wno-unused-variable -Wno-sign-compare"
# # 64-bit build
# gcc $CommonFlags weasel_server.c -o weasel_server.x86_64 -g -Wl,-rpath,'$ORIGIN/x86_64'
# # 32-bit build
# gcc -m32 $CommonFlags weasel_server.c -o weasel_server.x86 -g -Wl,-rpath,'$ORIGIN/x86'