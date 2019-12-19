FROM node

RUN apt-get update \
    && apt-get install -y openssl

ARG target_dir="/root/ca"

ENV OPENSSL_DIR=${target_dir}

RUN mkdir -p $target_dir

COPY openssl.cnf $target_dir/

WORKDIR $target_dir 
RUN mkdir certs newcerts crl db private
RUN chmod 700 private
RUN touch db/index
RUN touch db/index.attr

RUN openssl rand -hex 16 > db/serial
RUN echo 1001 > db/crlnumber

WORKDIR /usr/src/app
COPY server.js ./
COPY package.json ./

RUN npm install

EXPOSE 8000

ENV PORT=8000

CMD [ "node", "server.js" ]