#!/bin/bash
shopt -s extglob
COMPONENT_NAME="bicli-mcp"

function Log(){
    dateFormat=$(date "+%Y-%m-%d %H:%M:%S")
    level="INFO"
    messageShow="message is null"
    if [[ $1 != "" ]];then
        typeset -u level=$1
    fi
    if [[ $2 != "" ]];then
        messageShow=$2
    fi
    printf "[%s] %s %s\n" "$level" "$dateFormat" "$messageShow"
}

function isError(){
  if [ $? -ne 0 ];then
      Log ERROR "Compilation failed, request the developer to confirm it."
    exit 1
  fi
}

function build(){
    Log INFO "Start ${COMPONENT_NAME} component build ..."

    npm install -g pnpm@10
    isError

    pnpm install --frozen-lockfile
    isError

    pnpm --filter @bicli/skills build
    isError

    pnpm --filter @bicli/core build
    isError

    pnpm --filter @bicli/mcp-server build
    isError
}

build
