const express = require('express');
const fs = require('fs');
const spawn = require('child_process').spawn;
const when = require('when');
const sequence = require('when/sequence');
const pipeline = require('when/pipeline');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.text());
axios.defaults.headers.post['Content-Type'] = 'text/plain';

const spawn_p = (command, params) => {
	if (typeof params === 'string') params = params.split(' ')
    var defer = when.defer();
	var proc = spawn(command, params);
	proc.on("error", (error) => {
		defer.reject(stderr + new Error(error.stack || error));
	});
	proc.on("exit", (code) => {
		if (code !== 0) {
			defer.reject(new Error(`${command} exited with code ${code}`));
		} else {
			defer.resolve();
		}
	});
    return defer.promise;
}

const accessFile = (path) => {
    var defer = when.defer();
	fs.access(path, fs.F_OK, (err) => {
		if (err) {
			defer.reject(new Error(err));
		} else {
			defer.resolve();
		}
	});
    return defer.promise;
}

const readFile = (path) => {
    var defer = when.defer();
	fs.readFile(path, 'ascii', (err, content) => {
		if (err) {
			defer.reject(new Error(err));
		} else {
			defer.resolve(content);
		}
	});
    return defer.promise;
}

const writeFile = (path, content) => {
    var defer = when.defer();
	fs.writeFile(path, content, 'ascii', (err) => {
		if (err) {
			defer.reject(new Error(err));
		} else {
			defer.resolve();
		}
	});
    return defer.promise;
}

const command = (cmd, params) => {
	return () => {
		return spawn_p(cmd, params);
	};
}

// openssl wrapper
const openssl = (params) => {
	return command('openssl', params);
};

dir = process.env.OPENSSL_DIR
opensslConfig = `${dir}/openssl.cnf`
keyPath = `${dir}/private/server.key.pem`
certReqPath = `${dir}/certs/server.csr`
certPath = `${dir}/certs/server.cert.pem`
secret = 'file:/run/secrets/REQ_KEY_PASS'
CA_SERVICE_URL = `http://${process.env.CA_SERVICE_HOST}`

generateCert = (certReqPath, certPath) => {
	return pipeline([
		openssl(`genpkey -algorithm RSA -aes-256-cbc -out ${keyPath} -pass ${secret} -pkeyopt rsa_keygen_bits:2048`),
		command('chmod', `400 ${keyPath}`),
		openssl(`req -new -config ${opensslConfig} -key ${keyPath} -passin ${secret} -out ${certReqPath} -batch`),
		command('chmod', `444 ${certReqPath}`),
		() => { return readFile(certReqPath); },
		(certRequest) => { return axios({ method: 'post', url: `${CA_SERVICE_URL}/certs`, data: certRequest, responseType: 'text' }); },
		(certResponse) => { return writeFile(certPath, certResponse.data) },
		command('chmod', `444 ${certPath}`),
		() => { return readFile(certPath); }
	]);
};

app.get('/certs', (req, res) => {
	sequence([
		() => { return accessFile(certPath); },
		() => { return readFile(certPath); }
	]).then((results) => {
		return res.status(200).end(results[1]);
	}).otherwise((error) => {
		return res.sendStatus(404);
	});
});

app.get('/certs/new', (req, res) => {
	generateCert(certReqPath, certPath)
	.then((cert) => {
		return res.status(200).end(cert);
	}).otherwise((err) => {
		return res.status(404).send(err);
	});
});

app.listen(process.env.PORT, () => {});
