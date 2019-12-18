const express = require('express');
const fs = require('fs');
const spawn = require('child_process').spawn;
const when = require('when');
const sequence = require('when/sequence');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.text());

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
keyPath = `${dir}/private/root-ca.key.pem`
certReqPath = `${dir}/certs/root-ca.csr`
certPath = `${dir}/certs/root-ca.cert.pem`
newCertsPath = `${dir}/newcerts`
indexFilePath = `${dir}/db/index`
crlFilePath = `${dir}/crl/root-ca.crl.pem`
secret = 'file:/run/secrets/CA_KEY_PASS'

generateCert = (certReqPath, certPath) => {
	sequence([
		openssl(`genpkey -algorithm RSA -aes-256-cbc -out ${keyPath} -pass ${secret} -pkeyopt rsa_keygen_bits:4096`),
		command('chmod', `400 ${keyPath}`),
		openssl(`req -new -config ${opensslConfig} -key ${keyPath} -passin ${secret} -out ${certReqPath}`),
		command('chmod', `444 ${certReqPath}`),
		openssl(`ca -selfsign -config ${opensslConfig} -in ${certReqPath} -passin ${secret} -out ${certPath} -extensions ca_ext -notext -batch`),
		command('chmod', `444 ${certPath}`)
	]).otherwise((error) => {
		console.error(error.stack || error);
	});
};

// return CA certificate
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

// return index db file
app.get('/certs/all', (req, res) => {
	sequence([
		() => { return accessFile(indexFilePath); },
		() => { return readFile(indexFilePath); }
	]).then((results) => {
		return res.status(200).end(results[1]);
	}).otherwise((error) => {
		return res.sendStatus(404);
	});
});

// return revoked certificates list
app.get('/certs/crl', (req, res) => {
	sequence([
		openssl(`ca -gencrl -config ${opensslConfig} -passin ${secret} -out ${crlFilePath}`),
		() => { return readFile(crlFilePath); }
	]).then((results) => {
		return res.status(200).end(results[1]);
	}).otherwise((error) => {
		return res.sendStatus(404);
	});
});

// sign certificate request
app.post('/certs', (req, res) => {
	csr = req.body
	sequence([
		() => { return writeFile('/root/ca/request.csr', csr); },
		openssl(`ca -config ${opensslConfig} -policy signing_policy -extensions signing_req -passin ${secret} -in /root/ca/request.csr -out servercert.pem -notext -batch`),
		() => { return readFile('servercert.pem'); }
	]).then((results) => {
		return res.status(200).end(results[2]);
	}).otherwise((error) => {
		return res.status(400).send(error);
	});
});

// revoke certificate
app.delete('/certs', (req, res) => {
	serial = req.query['serial']
	reason = req.query['reason'] || 'keyCompromise'
	openssl(`ca -config ${opensslConfig} -revoke ${newCertsPath}/${serial}.pem -passin ${secret} -crl_reason ${reason}`)()
	.then((results) => {
		return res.sendStatus(200);
	}).otherwise((error) => {
		return res.sendStatus(400);
	});
});

app.listen(process.env.PORT, () => {
	accessFile(certPath)
		.otherwise((error) => {
			generateCert(certReqPath, certPath);
		});
});

