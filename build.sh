#!/bin/bash

mkdir -p build
pushd build
gcc ../weasel_server.c -g

popd

# # # extra's:
# gcc -o output_weasel_server weasel_server.c ;;
# gcc -o output_weasel_server weasel_server.c -O3 ;;

