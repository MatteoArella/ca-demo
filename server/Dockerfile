FROM node

RUN apt-get update \
    && apt-get install -y openssl

ARG target_dir="/etc/requester"

ENV OPENSSL_DIR=${target_dir}

RUN mkdir -p $target_dir

COPY openssl.cnf $target_dir/

WORKDIR $target_dir 
RUN mkdir certs private
RUN chmod 700 private

WORKDIR /usr/src/app
COPY server.js ./
COPY package.json ./

RUN npm install

EXPOSE 8000

ENV PORT=8000

CMD [ "node", "server.js" ]