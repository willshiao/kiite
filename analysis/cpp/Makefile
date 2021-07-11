CC = g++
CFLAGS = -Wall -O2 -std=c++17
LIB_PATH=
LIBS=

all: build bin/get_urls

obj/simdjson.o : ext/simdjson.cpp
	$(CC) $(CFLAGS) $(LIB_PATH) $(LIBS) -c ext/simdjson.cpp -o obj/simdjson.o

bin/get_urls : get_urls.cpp obj/simdjson.o
	$(CC) $(CFLAGS) $(LIB_PATH) $(LIBS) obj/simdjson.o get_urls.cpp -o bin/get_urls

build:
	@mkdir -p bin
	@mkdir -p obj

clean:
	rm -rf bin
	rm -rf obj
