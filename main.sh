#!/bin/bash
ca_manager_name="ca-manager"
workers=("requester1" "requester2")
stack_name="ca_stack"
manager_virtual_memory=2048
worker_virtual_memory=1024

function create {
    docker-machine create --driver virtualbox --virtualbox-memory=$manager_virtual_memory --virtualbox-cpu-count=2 $ca_manager_name
    manager_ip=`docker-machine ip ${ca_manager_name}`
    # initialize ca-manager as swarm manager
    add_worker_command=`docker-machine ssh ${ca_manager_name} "docker swarm init --advertise-addr ${manager_ip};" | grep -e "--token" | cut -c 5-`

    for worker_name in "${workers[@]}"; do
        docker-machine create --driver virtualbox --virtualbox-memory=$worker_virtual_memory --virtualbox-cpu-count=2 $worker_name
        docker-machine ssh $worker_name "${add_worker_command};" # join swarm as worker
    done

    eval $(docker-machine env ${ca_manager_name})
    # create private service images registry
    docker service create --name registry --publish published=5000,target=5000 --constraint "node.role == manager" registry:2

    # create swarm secrets
    openssl rand -hex 32 | docker secret create CA_KEY_PASS -
    openssl rand -hex 32 | docker secret create REQ_KEY_PASS -

    # install docker UCP
    #docker image pull docker/ucp:2.2.6
    #docker container run --rm -it --name ucp -v /var/run/docker.sock:/var/run/docker.sock docker/ucp:2.2.6 install --host-address $manager_ip --swarm-port 9090 --interactive
}

function build {
    # build and push CA service docker image
    docker build -t ca-image:latest --no-cache -f "ca_Dockerfile" .
    docker tag ca-image:latest 127.0.0.1:5000/ca-image:latest
    docker push 127.0.0.1:5000/ca-image:latest

    # build and push certificate signing request service docker image
    docker build -t request-image:latest --no-cache -f "request_Dockerfile" .
    docker tag request-image:latest 127.0.0.1:5000/request-image:latest
    docker push 127.0.0.1:5000/request-image:latest
}

function start {
    manager_ip=`docker-machine ip ${ca_manager_name}`
    ./docker-compose.yml.d $manager_ip
    docker stack deploy --prune -c docker-compose.yml $stack_name
    docker stack ps $stack_name
}

function restart {
    docker-machine start $ca_manager_name
    for worker_name in "${workers[@]}"; do
        docker-machine start $worker_name
    done
}

function update {
    build
    docker service update --force --image 127.0.0.1:5000/ca-image:latest "${stack_name}_ca"
    docker service update --force --image 127.0.0.1:5000/request-image:latest "${stack_name}_request"
}

function status {
    docker-machine ssh $ca_manager_name "docker node ls"
}

function ls {
    docker-machine ls
}

function services {
    docker service ls
}

function logs {
    docker service logs $1
}

function stop {
    docker stack rm $stack_name
}

function remove {
    docker service rm registry
    docker-machine stop $(docker-machine ls -q)
    docker-machine rm -y $(docker-machine ls -q)
}

function usage {
    echo $"Usage: $0 {create | build | start | restart | update | stop | status | ls | services | logs <service> | remove}"
}

case "$1" in
    create)
        create
        ls
        ;;
    build)
        eval $(docker-machine env ${ca_manager_name})
        build
        ;;
    start)
        eval $(docker-machine env ${ca_manager_name})
        start
        ;;
    restart)
        restart
        ;;
    update)
        eval $(docker-machine env ${ca_manager_name})
        update
        ;;
    stop)
        eval $(docker-machine env ${ca_manager_name})
        stop
        ;;
    remove)
        remove
        ;;
    status)
        status
        ;;
    ls)
        ls
        ;;
    services)
        eval $(docker-machine env ${ca_manager_name})
        services
        ;;
    logs)
        eval $(docker-machine env ${ca_manager_name})
        logs $2
        ;;
    *)
        usage
        exit 1
esac