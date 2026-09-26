(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('http'), require('fs'), require('crypto')) :
        typeof define === 'function' && define.amd ? define(['http', 'fs', 'crypto'], factory) :
            (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Server = factory(global.http, global.fs, global.crypto));
}(this, (function (http, fs, crypto) {
    'use strict';

    function _interopDefaultLegacy(e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

    var http__default = /*#__PURE__*/_interopDefaultLegacy(http);
    var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
    var crypto__default = /*#__PURE__*/_interopDefaultLegacy(crypto);

    class ServiceError extends Error {
        constructor(message = 'Service Error') {
            super(message);
            this.name = 'ServiceError';
        }
    }

    class NotFoundError extends ServiceError {
        constructor(message = 'Resource not found') {
            super(message);
            this.name = 'NotFoundError';
            this.status = 404;
        }
    }

    class RequestError extends ServiceError {
        constructor(message = 'Request error') {
            super(message);
            this.name = 'RequestError';
            this.status = 400;
        }
    }

    class ConflictError extends ServiceError {
        constructor(message = 'Resource conflict') {
            super(message);
            this.name = 'ConflictError';
            this.status = 409;
        }
    }

    class AuthorizationError extends ServiceError {
        constructor(message = 'Unauthorized') {
            super(message);
            this.name = 'AuthorizationError';
            this.status = 401;
        }
    }

    class CredentialError extends ServiceError {
        constructor(message = 'Forbidden') {
            super(message);
            this.name = 'CredentialError';
            this.status = 403;
        }
    }

    var errors = {
        ServiceError,
        NotFoundError,
        RequestError,
        ConflictError,
        AuthorizationError,
        CredentialError
    };

    const { ServiceError: ServiceError$1 } = errors;


    function createHandler(plugins, services) {
        return async function handler(req, res) {
            const method = req.method;
            console.info(`<< ${req.method} ${req.url}`);

            // Redirect fix for admin panel relative paths
            if (req.url.slice(-6) == '/admin') {
                res.writeHead(302, {
                    'Location': `http://${req.headers.host}/admin/`
                });
                return res.end();
            }

            let status = 200;
            let headers = {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            };
            let result = '';
            let context;

            // NOTE: the OPTIONS method results in undefined result and also it never processes plugins - keep this in mind
            if (method == 'OPTIONS') {
                Object.assign(headers, {
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
                    'Access-Control-Allow-Credentials': false,
                    'Access-Control-Max-Age': '86400',
                    'Access-Control-Allow-Headers': 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, X-Authorization, X-Admin'
                });
            } else {
                try {
                    context = processPlugins();
                    await handle(context);
                } catch (err) {
                    if (err instanceof ServiceError$1) {
                        status = err.status || 400;
                        result = composeErrorObject(err.code || status, err.message);
                    } else {
                        // Unhandled exception, this is due to an error in the service code - REST consumers should never have to encounter this;
                        // If it happens, it must be debugged in a future version of the server
                        console.error(err);
                        status = 500;
                        result = composeErrorObject(500, 'Server Error');
                    }
                }
            }

            res.writeHead(status, headers);
            if (context != undefined && context.util != undefined && context.util.throttle) {
                await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
            }
            res.end(result);

            function processPlugins() {
                const context = { params: {} };
                plugins.forEach(decorate => decorate(context, req));
                return context;
            }

            async function handle(context) {
                const { serviceName, tokens, query, body } = await parseRequest(req);
                if (serviceName == 'admin') {
                    return ({ headers, result } = services['admin'](method, tokens, query, body));
                } else if (serviceName == 'favicon.ico') {
                    return ({ headers, result } = services['favicon'](method, tokens, query, body));
                }

                const service = services[serviceName];

                if (service === undefined) {
                    status = 400;
                    result = composeErrorObject(400, `Service "${serviceName}" is not supported`);
                    console.error('Missing service ' + serviceName);
                } else {
                    result = await service(context, { method, tokens, query, body });
                }

                // NOTE: logout does not return a result
                // in this case the content type header should be omitted, to allow checks on the client
                if (result !== undefined) {
                    result = JSON.stringify(result);
                } else {
                    status = 204;
                    delete headers['Content-Type'];
                }
            }
        };
    }



    function composeErrorObject(code, message) {
        return JSON.stringify({
            code,
            message
        });
    }

    async function parseRequest(req) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const tokens = url.pathname.split('/').filter(x => x.length > 0);
        const serviceName = tokens.shift();
        const queryString = url.search.split('?')[1] || '';
        const query = queryString
            .split('&')
            .filter(s => s != '')
            .map(x => x.split('='))
            .reduce((p, [k, v]) => Object.assign(p, { [k]: decodeURIComponent(v.replace(/\+/g, " ")) }), {});

        let body;
        // If req stream has ended body has been parsed
        if (req.readableEnded) {
            body = req.body;
        } else {
            body = await parseBody(req);
        }

        return {
            serviceName,
            tokens,
            query,
            body
        };
    }

    function parseBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', (chunk) => body += chunk.toString());
            req.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (err) {
                    resolve(body);
                }
            });
        });
    }

    var requestHandler = createHandler;

    class Service {
        constructor() {
            this._actions = [];
            this.parseRequest = this.parseRequest.bind(this);
        }

        /**
         * Handle service request, after it has been processed by a request handler
         * @param {*} context Execution context, contains result of middleware processing
         * @param {{method: string, tokens: string[], query: *, body: *}} request Request parameters
         */
        async parseRequest(context, request) {
            for (let { method, name, handler } of this._actions) {
                if (method === request.method && matchAndAssignParams(context, request.tokens[0], name)) {
                    return await handler(context, request.tokens.slice(1), request.query, request.body);
                }
            }
        }

        /**
         * Register service action
         * @param {string} method HTTP method
         * @param {string} name Action name. Can be a glob pattern.
         * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
         */
        registerAction(method, name, handler) {
            this._actions.push({ method, name, handler });
        }

        /**
         * Register GET action
         * @param {string} name Action name. Can be a glob pattern.
         * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
         */
        get(name, handler) {
            this.registerAction('GET', name, handler);
        }

        /**
         * Register POST action
         * @param {string} name Action name. Can be a glob pattern.
         * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
         */
        post(name, handler) {
            this.registerAction('POST', name, handler);
        }

        /**
         * Register PUT action
         * @param {string} name Action name. Can be a glob pattern.
         * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
         */
        put(name, handler) {
            this.registerAction('PUT', name, handler);
        }

        /**
         * Register PATCH action
         * @param {string} name Action name. Can be a glob pattern.
         * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
         */
        patch(name, handler) {
            this.registerAction('PATCH', name, handler);
        }

        /**
         * Register DELETE action
         * @param {string} name Action name. Can be a glob pattern.
         * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
         */
        delete(name, handler) {
            this.registerAction('DELETE', name, handler);
        }
    }

    function matchAndAssignParams(context, name, pattern) {
        if (pattern == '*') {
            return true;
        } else if (pattern[0] == ':') {
            context.params[pattern.slice(1)] = name;
            return true;
        } else if (name == pattern) {
            return true;
        } else {
            return false;
        }
    }

    var Service_1 = Service;

    function uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            let r = Math.random() * 16 | 0,
                v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    var util = {
        uuid
    };

    const uuid$1 = util.uuid;


    const data = fs__default['default'].existsSync('./data') ? fs__default['default'].readdirSync('./data').reduce((p, c) => {
        const content = JSON.parse(fs__default['default'].readFileSync('./data/' + c));
        const collection = c.slice(0, -5);
        p[collection] = {};
        for (let endpoint in content) {
            p[collection][endpoint] = content[endpoint];
        }
        return p;
    }, {}) : {};

    const actions = {
        get: (context, tokens, query, body) => {
            tokens = [context.params.collection, ...tokens];
            let responseData = data;
            for (let token of tokens) {
                if (responseData !== undefined) {
                    responseData = responseData[token];
                }
            }
            return responseData;
        },
        post: (context, tokens, query, body) => {
            tokens = [context.params.collection, ...tokens];
            console.log('Request body:\n', body);

            // TODO handle collisions, replacement
            let responseData = data;
            for (let token of tokens) {
                if (responseData.hasOwnProperty(token) == false) {
                    responseData[token] = {};
                }
                responseData = responseData[token];
            }

            const newId = uuid$1();
            responseData[newId] = Object.assign({}, body, { _id: newId });
            return responseData[newId];
        },
        put: (context, tokens, query, body) => {
            tokens = [context.params.collection, ...tokens];
            console.log('Request body:\n', body);

            let responseData = data;
            for (let token of tokens.slice(0, -1)) {
                if (responseData !== undefined) {
                    responseData = responseData[token];
                }
            }
            if (responseData !== undefined && responseData[tokens.slice(-1)] !== undefined) {
                responseData[tokens.slice(-1)] = body;
            }
            return responseData[tokens.slice(-1)];
        },
        patch: (context, tokens, query, body) => {
            tokens = [context.params.collection, ...tokens];
            console.log('Request body:\n', body);

            let responseData = data;
            for (let token of tokens) {
                if (responseData !== undefined) {
                    responseData = responseData[token];
                }
            }
            if (responseData !== undefined) {
                Object.assign(responseData, body);
            }
            return responseData;
        },
        delete: (context, tokens, query, body) => {
            tokens = [context.params.collection, ...tokens];
            let responseData = data;

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                if (responseData.hasOwnProperty(token) == false) {
                    return null;
                }
                if (i == tokens.length - 1) {
                    const body = responseData[token];
                    delete responseData[token];
                    return body;
                } else {
                    responseData = responseData[token];
                }
            }
        }
    };

    const dataService = new Service_1();
    dataService.get(':collection', actions.get);
    dataService.post(':collection', actions.post);
    dataService.put(':collection', actions.put);
    dataService.patch(':collection', actions.patch);
    dataService.delete(':collection', actions.delete);


    var jsonstore = dataService.parseRequest;

    /*
     * This service requires storage and auth plugins
     */

    const { AuthorizationError: AuthorizationError$1 } = errors;



    const userService = new Service_1();

    userService.get('me', getSelf);
    userService.post('register', onRegister);
    userService.post('login', onLogin);
    userService.get('logout', onLogout);


    function getSelf(context, tokens, query, body) {
        if (context.user) {
            const result = Object.assign({}, context.user);
            delete result.hashedPassword;
            return result;
        } else {
            throw new AuthorizationError$1();
        }
    }

    function onRegister(context, tokens, query, body) {
        return context.auth.register(body);
    }

    function onLogin(context, tokens, query, body) {
        return context.auth.login(body);
    }

    function onLogout(context, tokens, query, body) {
        return context.auth.logout();
    }

    var users = userService.parseRequest;

    const { NotFoundError: NotFoundError$1, RequestError: RequestError$1 } = errors;


    var crud = {
        get,
        post,
        put,
        patch,
        delete: del
    };


    function validateRequest(context, tokens, query) {
        /*
        if (context.params.collection == undefined) {
            throw new RequestError('Please, specify collection name');
        }
        */
        if (tokens.length > 1) {
            throw new RequestError$1();
        }
    }

    function parseWhere(query) {
        const operators = {
            '<=': (prop, value) => record => record[prop] <= JSON.parse(value),
            '<': (prop, value) => record => record[prop] < JSON.parse(value),
            '>=': (prop, value) => record => record[prop] >= JSON.parse(value),
            '>': (prop, value) => record => record[prop] > JSON.parse(value),
            '=': (prop, value) => record => record[prop] == JSON.parse(value),
            ' like ': (prop, value) => record => record[prop].toLowerCase().includes(JSON.parse(value).toLowerCase()),
            ' in ': (prop, value) => record => JSON.parse(`[${/\((.+?)\)/.exec(value)[1]}]`).includes(record[prop]),
        };
        const pattern = new RegExp(`^(.+?)(${Object.keys(operators).join('|')})(.+?)$`, 'i');

        try {
            let clauses = [query.trim()];
            let check = (a, b) => b;
            let acc = true;
            if (query.match(/ and /gi)) {
                // inclusive
                clauses = query.split(/ and /gi);
                check = (a, b) => a && b;
                acc = true;
            } else if (query.match(/ or /gi)) {
                // optional
                clauses = query.split(/ or /gi);
                check = (a, b) => a || b;
                acc = false;
            }
            clauses = clauses.map(createChecker);

            return (record) => clauses
                .map(c => c(record))
                .reduce(check, acc);
        } catch (err) {
            throw new Error('Could not parse WHERE clause, check your syntax.');
        }

        function createChecker(clause) {
            let [match, prop, operator, value] = pattern.exec(clause);
            [prop, value] = [prop.trim(), value.trim()];

            return operators[operator.toLowerCase()](prop, value);
        }
    }


    function get(context, tokens, query, body) {
        validateRequest(context, tokens);

        let responseData;

        try {
            if (query.where) {
                responseData = context.storage.get(context.params.collection).filter(parseWhere(query.where));
            } else if (context.params.collection) {
                responseData = context.storage.get(context.params.collection, tokens[0]);
            } else {
                // Get list of collections
                return context.storage.get();
            }

            if (query.sortBy) {
                const props = query.sortBy
                    .split(',')
                    .filter(p => p != '')
                    .map(p => p.split(' ').filter(p => p != ''))
                    .map(([p, desc]) => ({ prop: p, desc: desc ? true : false }));

                // Sorting priority is from first to last, therefore we sort from last to first
                for (let i = props.length - 1; i >= 0; i--) {
                    let { prop, desc } = props[i];
                    responseData.sort(({ [prop]: propA }, { [prop]: propB }) => {
                        if (typeof propA == 'number' && typeof propB == 'number') {
                            return (propA - propB) * (desc ? -1 : 1);
                        } else {
                            return propA.localeCompare(propB) * (desc ? -1 : 1);
                        }
                    });
                }
            }

            if (query.offset) {
                responseData = responseData.slice(Number(query.offset) || 0);
            }
            const pageSize = Number(query.pageSize) || 10;
            if (query.pageSize) {
                responseData = responseData.slice(0, pageSize);
            }

            if (query.distinct) {
                const props = query.distinct.split(',').filter(p => p != '');
                responseData = Object.values(responseData.reduce((distinct, c) => {
                    const key = props.map(p => c[p]).join('::');
                    if (distinct.hasOwnProperty(key) == false) {
                        distinct[key] = c;
                    }
                    return distinct;
                }, {}));
            }

            if (query.count) {
                return responseData.length;
            }

            if (query.select) {
                const props = query.select.split(',').filter(p => p != '');
                responseData = Array.isArray(responseData) ? responseData.map(transform) : transform(responseData);

                function transform(r) {
                    const result = {};
                    props.forEach(p => result[p] = r[p]);
                    return result;
                }
            }

            if (query.load) {
                const props = query.load.split(',').filter(p => p != '');
                props.map(prop => {
                    const [propName, relationTokens] = prop.split('=');
                    const [idSource, collection] = relationTokens.split(':');
                    console.log(`Loading related records from "${collection}" into "${propName}", joined on "_id"="${idSource}"`);
                    const storageSource = collection == 'users' ? context.protectedStorage : context.storage;
                    responseData = Array.isArray(responseData) ? responseData.map(transform) : transform(responseData);

                    function transform(r) {
                        const seekId = r[idSource];
                        const related = storageSource.get(collection, seekId);
                        delete related.hashedPassword;
                        r[propName] = related;
                        return r;
                    }
                });
            }

        } catch (err) {
            console.error(err);
            if (err.message.includes('does not exist')) {
                throw new NotFoundError$1();
            } else {
                throw new RequestError$1(err.message);
            }
        }

        context.canAccess(responseData);

        return responseData;
    }

    function post(context, tokens, query, body) {
        console.log('Request body:\n', body);

        validateRequest(context, tokens);
        if (tokens.length > 0) {
            throw new RequestError$1('Use PUT to update records');
        }
        context.canAccess(undefined, body);

        body._ownerId = context.user._id;
        let responseData;

        try {
            responseData = context.storage.add(context.params.collection, body);
        } catch (err) {
            throw new RequestError$1();
        }

        return responseData;
    }

    function put(context, tokens, query, body) {
        console.log('Request body:\n', body);

        validateRequest(context, tokens);
        if (tokens.length != 1) {
            throw new RequestError$1('Missing entry ID');
        }

        let responseData;
        let existing;

        try {
            existing = context.storage.get(context.params.collection, tokens[0]);
        } catch (err) {
            throw new NotFoundError$1();
        }

        context.canAccess(existing, body);

        try {
            responseData = context.storage.set(context.params.collection, tokens[0], body);
        } catch (err) {
            throw new RequestError$1();
        }

        return responseData;
    }

    function patch(context, tokens, query, body) {
        console.log('Request body:\n', body);

        validateRequest(context, tokens);
        if (tokens.length != 1) {
            throw new RequestError$1('Missing entry ID');
        }

        let responseData;
        let existing;

        try {
            existing = context.storage.get(context.params.collection, tokens[0]);
        } catch (err) {
            throw new NotFoundError$1();
        }

        context.canAccess(existing, body);

        try {
            responseData = context.storage.merge(context.params.collection, tokens[0], body);
        } catch (err) {
            throw new RequestError$1();
        }

        return responseData;
    }

    function del(context, tokens, query, body) {
        validateRequest(context, tokens);
        if (tokens.length != 1) {
            throw new RequestError$1('Missing entry ID');
        }

        let responseData;
        let existing;

        try {
            existing = context.storage.get(context.params.collection, tokens[0]);
        } catch (err) {
            throw new NotFoundError$1();
        }

        context.canAccess(existing);

        try {
            responseData = context.storage.delete(context.params.collection, tokens[0]);
        } catch (err) {
            throw new RequestError$1();
        }

        return responseData;
    }

    /*
     * This service requires storage and auth plugins
     */

    const dataService$1 = new Service_1();
    dataService$1.get(':collection', crud.get);
    dataService$1.post(':collection', crud.post);
    dataService$1.put(':collection', crud.put);
    dataService$1.patch(':collection', crud.patch);
    dataService$1.delete(':collection', crud.delete);

    var data$1 = dataService$1.parseRequest;

    const imgdata = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAPNnpUWHRSYXcgcHJvZmlsZSB0eXBlIGV4aWYAAHja7ZpZdiS7DUT/uQovgSQ4LofjOd6Bl+8LZqpULbWm7vdnqyRVKQeCBAKBAFNm/eff2/yLr2hzMSHmkmpKlq9QQ/WND8VeX+38djac3+cr3af4+5fj5nHCc0h4l+vP8nJicdxzeN7Hxz1O43h8Gmi0+0T/9cT09/jlNuAeBs+XuMuAvQ2YeQ8k/jrhwj2Re3mplvy8hH3PKPr7SLl+jP6KkmL2OeErPnmbQ9q8Rmb0c2ynxafzO+eET7mC65JPjrM95exN2jmmlYLnophSTKLDZH+GGAwWM0cyt3C8nsHWWeG4Z/Tio7cHQiZ2M7JK8X6JE3t++2v5oj9O2nlvfApc50SkGQ5FDnm5B2PezJ8Bw1PUPvl6cYv5G788u8V82y/lPTgfn4CC+e2JN+Ds5T4ubzCVHu8M9JsTLr65QR5m/LPhvh6G/S8zcs75XzxZXn/2nmXvda2uhURs051x51bzMgwXdmIl57bEK/MT+ZzPq/IqJPEA+dMO23kNV50HH9sFN41rbrvlJu/DDeaoMci8ez+AjB4rkn31QxQxQV9u+yxVphRgM8CZSDDiH3Nxx2499oYrWJ6OS71jMCD5+ct8dcF3XptMNupie4XXXQH26nCmoZHT31xGQNy+4xaPg19ejy/zFFghgvG4ubDAZvs1RI/uFVtyACBcF3m/0sjlqVHzByUB25HJOCEENjmJLjkL2LNzQXwhQI2Ze7K0EwEXo59M0geRRGwKOMI292R3rvXRX8fhbuJDRkomNlUawQohgp8cChhqUWKIMZKxscQamyEBScaU0knM1E6WxUxO5pJrbkVKKLGkkksptbTqq1AjYiWLa6m1tobNFkyLjbsbV7TWfZceeuyp51567W0AnxFG1EweZdTRpp8yIayZZp5l1tmWI6fFrLDiSiuvsupqG6xt2WFHOCXvsutuj6jdUX33+kHU3B01fyKl1+VH1Diasw50hnDKM1FjRsR8cEQ8awQAtNeY2eJC8Bo5jZmtnqyInklGjc10thmXCGFYzsftHrF7jdy342bw9Vdx89+JnNHQ/QOR82bJm7j9JmqnGo8TsSsL1adWyD7Or9J8aTjbXx/+9v3/A/1vDUS9tHOXtLaM6JoBquRHJFHdaNU5oF9rKVSjYNewoFNsW032cqqCCx/yljA2cOy7+7zJ0biaicv1TcrWXSDXVT3SpkldUqqPIJj8p9oeWVs4upKL3ZHgpNzYnTRv5EeTYXpahYRgfC+L/FyxBphCmPLK3W1Zu1QZljTMJe5AIqmOyl0qlaFCCJbaPAIMWXzurWAMXiB1fGDtc+ld0ZU12k5cQq4v7+AB2x3qLlQ3hyU/uWdzzgUTKfXSputZRtp97hZ3z4EE36WE7WtjbqMtMr912oRp47HloZDlywxJ+uyzmrW91OivysrM1Mt1rZbrrmXm2jZrYWVuF9xZVB22jM4ccdaE0kh5jIrnzBy5w6U92yZzS1wrEao2ZPnE0tL0eRIpW1dOWuZ1WlLTqm7IdCESsV5RxjQ1/KWC/y/fPxoINmQZI8Cli9oOU+MJYgrv006VQbRGC2Ug8TYzrdtUHNjnfVc6/oN8r7tywa81XHdZN1QBUhfgzRLzmPCxu1G4sjlRvmF4R/mCYdUoF2BYNMq4AjD2GkMGhEt7PAJfKrH1kHmj8eukyLb1oCGW/WdAtx0cURYqtcGnNlAqods6UnaRpY3LY8GFbPeSrjKmsvhKnWTtdYKhRW3TImUqObdpGZgv3ltrdPwwtD+l1FD/htxAwjdUzhtIkWNVy+wBUmDtphwgVemd8jV1miFXWTpumqiqvnNuArCrFMbLPexJYpABbamrLiztZEIeYPasgVbnz9/NZxe4p/B+FV3zGt79B9S0Jc0Lu+YH4FXsAsa2YnRIAb2thQmGc17WdNd9cx4+y4P89EiVRKB+CvRkiPTwM7Ts+aZ5aV0C4zGoqyOGJv3yGMJaHXajKbOGkm40Ychlkw6c6hZ4s+SDJpsmncwmm8ChEmBWspX8MkFB+kzF1ZlgoGWiwzY6w4AIPDOcJxV3rtUnabEgoNBB4MbNm8GlluVIpsboaKl0YR8kGnXZH3JQZrH2MDxxRrHFUduh+CvQszakraM9XNo7rEVjt8VpbSOnSyD5dwLfVI4+Sl+DCZc5zU6zhrXnRhZqUowkruyZupZEm/dA2uVTroDg1nfdJMBua9yCJ8QPtGw2rkzlYLik5SBzUGSoOqBMJvwTe92eGgOVx8/T39TP0r/PYgfkP1IEyGVhYHXyJiVPU0skB3dGqle6OZuwj/Hw5c2gV5nEM6TYaAryq3CRXsj1088XNwt0qcliqNc6bfW+TttRydKpeJOUWTmmUiwJKzpr6hkVzzLrVs+s66xEiCwOzfg5IRgwQgFgrriRlg6WQS/nGyRUNDjulWsUbO8qu/lWaWeFe8QTs0puzrxXH1H0b91KgDm2dkdrpkpx8Ks2zZu4K1GHPpDxPdCL0RH0SZZrGX8hRKTA+oUPzQ+I0K1C16ZSK6TR28HUdlnfpzMsIvd4TR7iuSe/+pn8vief46IQULRGcHvRVUyn9aYeoHbGhEbct+vEuzIxhxJrgk1oyo3AFA7eSSSNI/Vxl0eLMCrJ/j1QH0ybj0C9VCn9BtXbz6Kd10b8QKtpTnecbnKHWZxcK2OiKCuViBHqrzM2T1uFlGJlMKFKRF1Zy6wMqQYtgKYc4PFoGv2dX2ixqGaoFDhjzRmp4fsygFZr3t0GmBqeqbcBFpvsMVCNajVWcLRaPBhRKc4RCCUGZphKJdisKdRjDKdaNbZfwM5BulzzCvyv0AsAlu8HOAdIXAuMAg0mWa0+0vgrODoHlm7Y7rXUHmm9r2RTLpXwOfOaT6iZdASpqOIXfiABLwQkrSPFXQgAMHjYyEVrOBESVgS4g4AxcXyiPwBiCF6g2XTPk0hqn4D67rbQVFv0Lam6Vfmvq90B3WgV+peoNRb702/tesrImcBCvIEaGoI/8YpKa1XmDNr1aGUwjDETBa3VkOLYVLGKeWQcd+WaUlsMdTdUg3TcUPvdT20ftDW4+injyAarDRVVRgc906sNTo1cu7LkDGewjkQ35Z7l4Htnx9MCkbenKiNMsif+5BNVnA6op3gZVZtjIAacNia+00w1ZutIibTMOJ7IISctvEQGDxEYDUSxUiH4R4kkH86dMywCqVJ2XpzkUYUgW3mDPmz0HLW6w9daRn7abZmo4QR5i/A21r4oEvCC31oajm5CR1yBZcIfN7rmgxM9qZBhXh3C6NR9dCS1PTMJ30c4fEcwkq0IXdphpB9eg4x1zycsof4t6C4jyS68eW7OonpSEYCzb5dWjQH3H5fWq2SH41O4LahPrSJA77KqpJYwH6pdxDfDIgxLR9GptCKMoiHETrJ0wFSR3Sk7yI97KdBVSHXeS5FBnYKIz1JU6VhdCkfHIP42o0V6aqgg00JtZfdK6hPeojtXvgfnE/VX0p0+fqxp2/nDfvBuHgeo7ppkrr/MyU1dT73n5B/qi76+lzMnVnHRJDeZOyj3XXdQrrtOUPQunDqgDlz+iuS3QDafITkJd050L0Hi2kiRBX52pIVso0ZpW1YQsT2VRgtxm9iiqU2qXyZ0OdvZy0J1gFotZFEuGrnt3iiiXvECX+UcWBqpPlgLRkdN7cpl8PxDjWseAu1bPdCjBSrQeVD2RHE7bRhMb1Qd3VHVXVNBewZ3Wm7avbifhB+4LNQrmp0WxiCNkm7dd7mV39SnokrvfzIr+oDSFq1D76MZchw6Vl4Z67CL01I6ZiX/VEqfM1azjaSkKqC+kx67tqTg5ntLii5b96TAA3wMTx2NvqsyyUajYQHJ1qkpmzHQITXDUZRGTYtNw9uLSndMmI9tfMdEeRgwWHB7NlosyivZPlvT5KIOc+GefU9UhA4MmKFXmhAuJRFVWHRJySbREImpQysz4g3uJckihD7P84nWtLo7oR4tr8IKdSBXYvYaZnm3ffhh9nyWPDa+zQfzdULsFlr/khrMb7hhAroOKSZgxbUzqdiVIhQc+iZaTbpesLXSbIfbjwXTf8AjbnV6kTpD4ZsMdXMK45G1NRiMdh/bLb6oXX+4rWHen9BW+xJDV1N+i6HTlKdLDMnVkx8tdHryus3VlCOXXKlDIiuOkimXnmzmrtbGqmAHL1TVXU73PX5nx3xhSO3QKtBqbd31iQHHBNXXrYIXHVyQqDGIcc6qHEcz2ieN+radKS9br/cGzC0G7g0YFQPGdqs7MI6pOt2BgYtt/4MNW8NJ3VT5es/izZZFd9yIfwY1lUubGSSnPiWWzDpAN+sExNptEoBx74q8bAzdFu6NocvC2RgK2WR7doZodiZ6OgoUrBoWIBM2xtMHXUX3GGktr5RtwPZ9tTWfleFP3iEc2hTar6IC1Y55ktYKQtXTsKkfgQ+al0aXBCh2dlCxdBtLtc8QJ4WUKIX+jlRR/TN9pXpNA1bUC7LaYUzJvxr6rh2Q7ellILBd0PcFF5F6uArA6ODZdjQYosZpf7lbu5kNFfbGUUY5C2p7esLhhjw94Miqk+8tDPgTVXX23iliu782KzsaVdexRSq4NORtmY3erV/NFsJU9S7naPXmPGLYvuy5USQA2pcb4z/fYafpPj0t5HEeD1y7W/Z+PHA2t8L1eGCCeFS/Ph04Hafu+Uf8ly2tjUNDQnNUIOqVLrBLIwxK67p3fP7LaX/LjnlniCYv6jNK0ce5YrPud1Gc6LQWg+sumIt2hCCVG3e8e5tsLAL2qWekqp1nKPKqKIJcmxO3oljxVa1TXVDVWmxQ/lhHHnYNP9UDrtFdwekRKCueDRSRAYoo0nEssbG3znTTDahVUXyDj+afeEhn3w/UyY0fSv5b8ZuSmaDVrURYmBrf0ZgIMOGuGFNG3FH45iA7VFzUnj/odcwHzY72OnQEhByP3PtKWxh/Q+/hkl9x5lEic5ojDGgEzcSpnJEwY2y6ZN0RiyMBhZQ35AigLvK/dt9fn9ZJXaHUpf9Y4IxtBSkanMxxP6xb/pC/I1D1icMLDcmjZlj9L61LoIyLxKGRjUcUtOiFju4YqimZ3K0odbd1Usaa7gPp/77IJRuOmxAmqhrWXAPOftoY0P/BsgifTmC2ChOlRSbIMBjjm3bQIeahGwQamM9wHqy19zaTCZr/AtjdNfWMu8SZAAAA13pUWHRSYXcgcHJvZmlsZSB0eXBlIGlwdGMAAHjaPU9LjkMhDNtzijlCyMd5HKflgdRdF72/xmFGJSIEx9ihvd6f2X5qdWizy9WH3+KM7xrRp2iw6hLARIfnSKsqoRKGSEXA0YuZVxOx+QcnMMBKJR2bMdNUDraxWJ2ciQuDDPKgNDA8kakNOwMLriTRO2Alk3okJsUiidC9Ex9HbNUMWJz28uQIzhhNxQduKhdkujHiSJVTCt133eqpJX/6MDXh7nrXydzNq9tssr14NXuwFXaoh/CPiLRfLvxMyj3GtTgAAAGFaUNDUElDQyBwcm9maWxlAAB4nH2RPUjDQBzFX1NFKfUD7CDikKE6WRAVESepYhEslLZCqw4ml35Bk4YkxcVRcC04+LFYdXBx1tXBVRAEP0Dc3JwUXaTE/yWFFjEeHPfj3b3H3TtAqJeZanaMA6pmGclYVMxkV8WuVwjoRQCz6JeYqcdTi2l4jq97+Ph6F+FZ3uf+HD1KzmSATySeY7phEW8QT29aOud94hArSgrxOfGYQRckfuS67PIb54LDAs8MGenkPHGIWCy0sdzGrGioxFPEYUXVKF/IuKxw3uKslquseU/+wmBOW0lxneYwYlhCHAmIkFFFCWVYiNCqkWIiSftRD/+Q40+QSyZXCYwcC6hAheT4wf/gd7dmfnLCTQpGgc4X2/4YAbp2gUbNtr+PbbtxAvifgSut5a/UgZlP0mstLXwE9G0DF9ctTd4DLneAwSddMiRH8tMU8nng/Yy+KQsM3AKBNbe35j5OH4A0dbV8AxwcAqMFyl73eHd3e2//nmn29wOGi3Kv+RixSgAAEkxpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+Cjx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IlhNUCBDb3JlIDQuNC4wLUV4aXYyIj4KIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgIHhtbG5zOmlwdGNFeHQ9Imh0dHA6Ly9pcHRjLm9yZy9zdGQvSXB0YzR4bXBFeHQvMjAwOC0wMi0yOS8iCiAgICB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIKICAgIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiCiAgICB4bWxuczpwbHVzPSJodHRwOi8vbnMudXNlcGx1cy5vcmcvbGRmL3htcC8xLjAvIgogICAgeG1sbnM6R0lNUD0iaHR0cDovL3d3dy5naW1wLm9yZy94bXAvIgogICAgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIgogICAgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIgogICAgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIgogICAgeG1sbnM6eG1wUmlnaHRzPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvcmlnaHRzLyIKICAgeG1wTU06RG9jdW1lbnRJRD0iZ2ltcDpkb2NpZDpnaW1wOjdjZDM3NWM3LTcwNmItNDlkMy1hOWRkLWNmM2Q3MmMwY2I4ZCIKICAgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo2NGY2YTJlYy04ZjA5LTRkZTMtOTY3ZC05MTUyY2U5NjYxNTAiCiAgIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDoxMmE1NzI5Mi1kNmJkLTRlYjQtOGUxNi1hODEzYjMwZjU0NWYiCiAgIEdJTVA6QVBJPSIyLjAiCiAgIEdJTVA6UGxhdGZvcm09IldpbmRvd3MiCiAgIEdJTVA6VGltZVN0YW1wPSIxNjEzMzAwNzI5NTMwNjQzIgogICBHSU1QOlZlcnNpb249IjIuMTAuMTIiCiAgIGRjOkZvcm1hdD0iaW1hZ2UvcG5nIgogICBwaG90b3Nob3A6Q3JlZGl0PSJHZXR0eSBJbWFnZXMvaVN0b2NrcGhvdG8iCiAgIHhtcDpDcmVhdG9yVG9vbD0iR0lNUCAyLjEwIgogICB4bXBSaWdodHM6V2ViU3RhdGVtZW50PSJodHRwczovL3d3dy5pc3RvY2twaG90by5jb20vbGVnYWwvbGljZW5zZS1hZ3JlZW1lbnQ/dXRtX21lZGl1bT1vcmdhbmljJmFtcDt1dG1fc291cmNlPWdvb2dsZSZhbXA7dXRtX2NhbXBhaWduPWlwdGN1cmwiPgogICA8aXB0Y0V4dDpMb2NhdGlvbkNyZWF0ZWQ+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpMb2NhdGlvbkNyZWF0ZWQ+CiAgIDxpcHRjRXh0OkxvY2F0aW9uU2hvd24+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpMb2NhdGlvblNob3duPgogICA8aXB0Y0V4dDpBcnR3b3JrT3JPYmplY3Q+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpBcnR3b3JrT3JPYmplY3Q+CiAgIDxpcHRjRXh0OlJlZ2lzdHJ5SWQ+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpSZWdpc3RyeUlkPgogICA8eG1wTU06SGlzdG9yeT4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgc3RFdnQ6YWN0aW9uPSJzYXZlZCIKICAgICAgc3RFdnQ6Y2hhbmdlZD0iLyIKICAgICAgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpjOTQ2M2MxMC05OWE4LTQ1NDQtYmRlOS1mNzY0ZjdhODJlZDkiCiAgICAgIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkdpbXAgMi4xMCAoV2luZG93cykiCiAgICAgIHN0RXZ0OndoZW49IjIwMjEtMDItMTRUMTM6MDU6MjkiLz4KICAgIDwvcmRmOlNlcT4KICAgPC94bXBNTTpIaXN0b3J5PgogICA8cGx1czpJbWFnZVN1cHBsaWVyPgogICAgPHJkZjpTZXEvPgogICA8L3BsdXM6SW1hZ2VTdXBwbGllcj4KICAgPHBsdXM6SW1hZ2VDcmVhdG9yPgogICAgPHJkZjpTZXEvPgogICA8L3BsdXM6SW1hZ2VDcmVhdG9yPgogICA8cGx1czpDb3B5cmlnaHRPd25lcj4KICAgIDxyZGY6U2VxLz4KICAgPC9wbHVzOkNvcHlyaWdodE93bmVyPgogICA8cGx1czpMaWNlbnNvcj4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgcGx1czpMaWNlbnNvclVSTD0iaHR0cHM6Ly93d3cuaXN0b2NrcGhvdG8uY29tL3Bob3RvL2xpY2Vuc2UtZ20xMTUwMzQ1MzQxLT91dG1fbWVkaXVtPW9yZ2FuaWMmYW1wO3V0bV9zb3VyY2U9Z29vZ2xlJmFtcDt1dG1fY2FtcGFpZ249aXB0Y3VybCIvPgogICAgPC9yZGY6U2VxPgogICA8L3BsdXM6TGljZW5zb3I+CiAgIDxkYzpjcmVhdG9yPgogICAgPHJkZjpTZXE+CiAgICAgPHJkZjpsaT5WbGFkeXNsYXYgU2VyZWRhPC9yZGY6bGk+CiAgICA8L3JkZjpTZXE+CiAgIDwvZGM6Y3JlYXRvcj4KICAgPGRjOmRlc2NyaXB0aW9uPgogICAgPHJkZjpBbHQ+CiAgICAgPHJkZjpsaSB4bWw6bGFuZz0ieC1kZWZhdWx0Ij5TZXJ2aWNlIHRvb2xzIGljb24gb24gd2hpdGUgYmFja2dyb3VuZC4gVmVjdG9yIGlsbHVzdHJhdGlvbi48L3JkZjpsaT4KICAgIDwvcmRmOkFsdD4KICAgPC9kYzpkZXNjcmlwdGlvbj4KICA8L3JkZjpEZXNjcmlwdGlvbj4KIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAKPD94cGFja2V0IGVuZD0idyI/PmWJCnkAAAAGYktHRAD/AP8A/6C9p5MAAAAJcEhZcwAALiMAAC4jAXilP3YAAAAHdElNRQflAg4LBR0CZnO/AAAARHRFWHRDb21tZW50AFNlcnZpY2UgdG9vbHMgaWNvbiBvbiB3aGl0ZSBiYWNrZ3JvdW5kLiBWZWN0b3IgaWxsdXN0cmF0aW9uLlwvEeIAAAMxSURBVHja7Z1bcuQwCEX7qrLQXlp2ynxNVWbK7dgWj3sl9JvYRhxACD369erW7UMzx/cYaychonAQvXM5ABYkpynoYIiEGdoQog6AYfywBrCxF4zNrX/7McBbuXJe8rXx/KBDULcGsMREzCbeZ4J6ME/9wVH5d95rogZp3npEgPLP3m2iUSGqXBJS5Dr6hmLm8kRuZABYti5TMaailV8LodNQwTTUWk4/WZk75l0kM0aZQdaZjMqkrQDAuyMVJWFjMB4GANXr0lbZBxQKr7IjI7QvVWkok/Jn5UHVh61CYPs+/i7eL9j3y/Au8WqoAIC34k8/9k7N8miLcaGWHwgjZXE/awyYX7h41wKMCskZM2HXAddDkTdglpSjz5bcKPbcCEKwT3+DhxtVpJvkEC7rZSgq32NMSBoXaCdiahDCKrND0fpX8oQlVsQ8IFQZ1VARdIF5wroekAjB07gsAgDUIbQHFENIDEX4CQANIVe8Iw/ASiACLXl28eaf579OPuBa9/mrELUYHQ1t3KHlZZnRcXb2/c7ygXIQZqjDMEzeSrOgCAhqYMvTUE+FKXoVxTxgk3DEPREjGzj3nAk/VaKyB9GVIu4oMyOlrQZgrBBEFG9PAZTfs3amYDGrP9Wl964IeFvtz9JFluIvlEvcdoXDOdxggbDxGwTXcxFRi/LdirKgZUBm7SUdJG69IwSUzAMWgOAq/4hyrZVaJISSNWHFVbEoCFEhyBrCtXS9L+so9oTy8wGqxbQDD350WTjNESVFEB5hdKzUGcV5QtYxVWR2Ssl4Mg9qI9u6FCBInJRXgfEEgtS9Cgrg7kKouq4mdcDNBnEHQvWFTdgdgsqP+MiluVeBM13ahx09AYSWi50gsF+I6vn7BmCEoHR3NBzkpIOw4+XdVBBGQUioblaZHbGlodtB+N/jxqwLX/x/NARfD8ADxTOCKIcwE4Lw0OIbguMYcGTlymEpHYLXIKx8zQEqIfS2lGJPaADFEBR/PMH79ErqtpnZmTBlvM4wgihPWDEEhXn1LISj50crNgfCp+dWHYQRCfb2zgfnBZmKGAyi914anK9Coi4LOMhoAn3uVtn+AGnLKxPUZnCuAAAAAElFTkSuQmCC';
    const img = Buffer.from(imgdata, 'base64');

    var favicon = (method, tokens, query, body) => {
        console.log('serving favicon...');
        const headers = {
            'Content-Type': 'image/png',
            'Content-Length': img.length
        };
        let result = img;

        return {
            headers,
            result
        };
    };

    var require$$0 = "<!DOCTYPE html>\r\n<html lang=\"en\">\r\n<head>\r\n    <meta charset=\"UTF-8\">\r\n    <meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\">\r\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\r\n    <title>SUPS Admin Panel</title>\r\n    <style>\r\n        * {\r\n            padding: 0;\r\n            margin: 0;\r\n        }\r\n\r\n        body {\r\n            padding: 32px;\r\n            font-size: 16px;\r\n        }\r\n\r\n        .layout::after {\r\n            content: '';\r\n            clear: both;\r\n            display: table;\r\n        }\r\n\r\n        .col {\r\n            display: block;\r\n            float: left;\r\n        }\r\n\r\n        p {\r\n            padding: 8px 16px;\r\n        }\r\n\r\n        table {\r\n            border-collapse: collapse;\r\n        }\r\n\r\n        caption {\r\n            font-size: 120%;\r\n            text-align: left;\r\n            padding: 4px 8px;\r\n            font-weight: bold;\r\n            background-color: #ddd;\r\n        }\r\n\r\n        table, tr, th, td {\r\n            border: 1px solid #ddd;\r\n        }\r\n\r\n        th, td {\r\n            padding: 4px 8px;\r\n        }\r\n\r\n        ul {\r\n            list-style: none;\r\n        }\r\n\r\n        .collection-list a {\r\n            display: block;\r\n            width: 120px;\r\n            padding: 4px 8px;\r\n            text-decoration: none;\r\n            color: black;\r\n            background-color: #ccc;\r\n        }\r\n        .collection-list a:hover {\r\n            background-color: #ddd;\r\n        }\r\n        .collection-list a:visited {\r\n            color: black;\r\n        }\r\n    </style>\r\n    <script type=\"module\">\nimport { html, render } from 'https://unpkg.com/lit-html@1.3.0?module';\nimport { until } from 'https://unpkg.com/lit-html@1.3.0/directives/until?module';\n\nconst api = {\r\n    async get(url) {\r\n        return json(url);\r\n    },\r\n    async post(url, body) {\r\n        return json(url, {\r\n            method: 'POST',\r\n            headers: { 'Content-Type': 'application/json' },\r\n            body: JSON.stringify(body)\r\n        });\r\n    }\r\n};\r\n\r\nasync function json(url, options) {\r\n    return await (await fetch('/' + url, options)).json();\r\n}\r\n\r\nasync function getCollections() {\r\n    return api.get('data');\r\n}\r\n\r\nasync function getRecords(collection) {\r\n    return api.get('data/' + collection);\r\n}\r\n\r\nasync function getThrottling() {\r\n    return api.get('util/throttle');\r\n}\r\n\r\nasync function setThrottling(throttle) {\r\n    return api.post('util', { throttle });\r\n}\n\nasync function collectionList(onSelect) {\r\n    const collections = await getCollections();\r\n\r\n    return html`\r\n    <ul class=\"collection-list\">\r\n        ${collections.map(collectionLi)}\r\n    </ul>`;\r\n\r\n    function collectionLi(name) {\r\n        return html`<li><a href=\"javascript:void(0)\" @click=${(ev) => onSelect(ev, name)}>${name}</a></li>`;\r\n    }\r\n}\n\nasync function recordTable(collectionName) {\r\n    const records = await getRecords(collectionName);\r\n    const layout = getLayout(records);\r\n\r\n    return html`\r\n    <table>\r\n        <caption>${collectionName}</caption>\r\n        <thead>\r\n            <tr>${layout.map(f => html`<th>${f}</th>`)}</tr>\r\n        </thead>\r\n        <tbody>\r\n            ${records.map(r => recordRow(r, layout))}\r\n        </tbody>\r\n    </table>`;\r\n}\r\n\r\nfunction getLayout(records) {\r\n    const result = new Set(['_id']);\r\n    records.forEach(r => Object.keys(r).forEach(k => result.add(k)));\r\n\r\n    return [...result.keys()];\r\n}\r\n\r\nfunction recordRow(record, layout) {\r\n    return html`\r\n    <tr>\r\n        ${layout.map(f => html`<td>${JSON.stringify(record[f]) || html`<span>(missing)</span>`}</td>`)}\r\n    </tr>`;\r\n}\n\nasync function throttlePanel(display) {\r\n    const active = await getThrottling();\r\n\r\n    return html`\r\n    <p>\r\n        Request throttling: </span>${active}</span>\r\n        <button @click=${(ev) => set(ev, true)}>Enable</button>\r\n        <button @click=${(ev) => set(ev, false)}>Disable</button>\r\n    </p>`;\r\n\r\n    async function set(ev, state) {\r\n        ev.target.disabled = true;\r\n        await setThrottling(state);\r\n        display();\r\n    }\r\n}\n\n//import page from '//unpkg.com/page/page.mjs';\r\n\r\n\r\nfunction start() {\r\n    const main = document.querySelector('main');\r\n    editor(main);\r\n}\r\n\r\nasync function editor(main) {\r\n    let list = html`<div class=\"col\">Loading&hellip;</div>`;\r\n    let viewer = html`<div class=\"col\">\r\n    <p>Select collection to view records</p>\r\n</div>`;\r\n    display();\r\n\r\n    list = html`<div class=\"col\">${await collectionList(onSelect)}</div>`;\r\n    display();\r\n\r\n    async function display() {\r\n        render(html`\r\n        <section class=\"layout\">\r\n            ${until(throttlePanel(display), html`<p>Loading</p>`)}\r\n        </section>\r\n        <section class=\"layout\">\r\n            ${list}\r\n            ${viewer}\r\n        </section>`, main);\r\n    }\r\n\r\n    async function onSelect(ev, name) {\r\n        ev.preventDefault();\r\n        viewer = html`<div class=\"col\">${await recordTable(name)}</div>`;\r\n        display();\r\n    }\r\n}\r\n\r\nstart();\n\n</script>\r\n</head>\r\n<body>\r\n    <main>\r\n        Loading&hellip;\r\n    </main>\r\n</body>\r\n</html>";

    const mode = process.argv[2] == '-dev' ? 'dev' : 'prod';

    const files = {
        index: mode == 'prod' ? require$$0 : fs__default['default'].readFileSync('./client/index.html', 'utf-8')
    };

    var admin = (method, tokens, query, body) => {
        const headers = {
            'Content-Type': 'text/html'
        };
        let result = '';

        const resource = tokens.join('/');
        if (resource && resource.split('.').pop() == 'js') {
            headers['Content-Type'] = 'application/javascript';

            files[resource] = files[resource] || fs__default['default'].readFileSync('./client/' + resource, 'utf-8');
            result = files[resource];
        } else {
            result = files.index;
        }

        return {
            headers,
            result
        };
    };

    /*
     * This service requires util plugin
     */

    const utilService = new Service_1();

    utilService.post('*', onRequest);
    utilService.get(':service', getStatus);

    function getStatus(context, tokens, query, body) {
        return context.util[context.params.service];
    }

    function onRequest(context, tokens, query, body) {
        Object.entries(body).forEach(([k, v]) => {
            console.log(`${k} ${v ? 'enabled' : 'disabled'}`);
            context.util[k] = v;
        });
        return '';
    }

    var util$1 = utilService.parseRequest;

    var services = {
        jsonstore,
        users,
        data: data$1,
        favicon,
        admin,
        util: util$1
    };

    const { uuid: uuid$2 } = util;


    function initPlugin(settings) {
        const storage = createInstance(settings.seedData);
        const protectedStorage = createInstance(settings.protectedData);

        return function decoreateContext(context, request) {
            context.storage = storage;
            context.protectedStorage = protectedStorage;
        };
    }


    /**
     * Create storage instance and populate with seed data
     * @param {Object=} seedData Associative array with data. Each property is an object with properties in format {key: value}
     */
    function createInstance(seedData = {}) {
        const collections = new Map();

        // Initialize seed data from file    
        for (let collectionName in seedData) {
            if (seedData.hasOwnProperty(collectionName)) {
                const collection = new Map();
                for (let recordId in seedData[collectionName]) {
                    if (seedData.hasOwnProperty(collectionName)) {
                        collection.set(recordId, seedData[collectionName][recordId]);
                    }
                }
                collections.set(collectionName, collection);
            }
        }


        // Manipulation

        /**
         * Get entry by ID or list of all entries from collection or list of all collections
         * @param {string=} collection Name of collection to access. Throws error if not found. If omitted, returns list of all collections.
         * @param {number|string=} id ID of requested entry. Throws error if not found. If omitted, returns of list all entries in collection.
         * @return {Object} Matching entry.
         */
        function get(collection, id) {
            if (!collection) {
                return [...collections.keys()];
            }
            if (!collections.has(collection)) {
                throw new ReferenceError('Collection does not exist: ' + collection);
            }
            const targetCollection = collections.get(collection);
            if (!id) {
                const entries = [...targetCollection.entries()];
                let result = entries.map(([k, v]) => {
                    return Object.assign(deepCopy(v), { _id: k });
                });
                return result;
            }
            if (!targetCollection.has(id)) {
                throw new ReferenceError('Entry does not exist: ' + id);
            }
            const entry = targetCollection.get(id);
            return Object.assign(deepCopy(entry), { _id: id });
        }

        /**
         * Add new entry to collection. ID will be auto-generated
         * @param {string} collection Name of collection to access. If the collection does not exist, it will be created.
         * @param {Object} data Value to store.
         * @return {Object} Original value with resulting ID under _id property.
         */
        function add(collection, data) {
            const record = assignClean({ _ownerId: data._ownerId }, data);

            let targetCollection = collections.get(collection);
            if (!targetCollection) {
                targetCollection = new Map();
                collections.set(collection, targetCollection);
            }
            let id = uuid$2();
            // Make sure new ID does not match existing value
            while (targetCollection.has(id)) {
                id = uuid$2();
            }

            record._createdOn = Date.now();
            targetCollection.set(id, record);
            return Object.assign(deepCopy(record), { _id: id });
        }

        /**
         * Replace entry by ID
         * @param {string} collection Name of collection to access. Throws error if not found.
         * @param {number|string} id ID of entry to update. Throws error if not found.
         * @param {Object} data Value to store. Record will be replaced!
         * @return {Object} Updated entry.
         */
        function set(collection, id, data) {
            if (!collections.has(collection)) {
                throw new ReferenceError('Collection does not exist: ' + collection);
            }
            const targetCollection = collections.get(collection);
            if (!targetCollection.has(id)) {
                throw new ReferenceError('Entry does not exist: ' + id);
            }

            const existing = targetCollection.get(id);
            const record = assignSystemProps(deepCopy(data), existing);
            record._updatedOn = Date.now();
            targetCollection.set(id, record);
            return Object.assign(deepCopy(record), { _id: id });
        }

        /**
         * Modify entry by ID
         * @param {string} collection Name of collection to access. Throws error if not found.
         * @param {number|string} id ID of entry to update. Throws error if not found.
         * @param {Object} data Value to store. Shallow merge will be performed!
         * @return {Object} Updated entry.
         */
        function merge(collection, id, data) {
            if (!collections.has(collection)) {
                throw new ReferenceError('Collection does not exist: ' + collection);
            }
            const targetCollection = collections.get(collection);
            if (!targetCollection.has(id)) {
                throw new ReferenceError('Entry does not exist: ' + id);
            }

            const existing = deepCopy(targetCollection.get(id));
            const record = assignClean(existing, data);
            record._updatedOn = Date.now();
            targetCollection.set(id, record);
            return Object.assign(deepCopy(record), { _id: id });
        }

        /**
         * Delete entry by ID
         * @param {string} collection Name of collection to access. Throws error if not found.
         * @param {number|string} id ID of entry to update. Throws error if not found.
         * @return {{_deletedOn: number}} Server time of deletion.
         */
        function del(collection, id) {
            if (!collections.has(collection)) {
                throw new ReferenceError('Collection does not exist: ' + collection);
            }
            const targetCollection = collections.get(collection);
            if (!targetCollection.has(id)) {
                throw new ReferenceError('Entry does not exist: ' + id);
            }
            targetCollection.delete(id);

            return { _deletedOn: Date.now() };
        }

        /**
         * Search in collection by query object
         * @param {string} collection Name of collection to access. Throws error if not found.
         * @param {Object} query Query object. Format {prop: value}.
         * @return {Object[]} Array of matching entries.
         */
        function query(collection, query) {
            if (!collections.has(collection)) {
                throw new ReferenceError('Collection does not exist: ' + collection);
            }
            const targetCollection = collections.get(collection);
            const result = [];
            // Iterate entries of target collection and compare each property with the given query
            for (let [key, entry] of [...targetCollection.entries()]) {
                let match = true;
                for (let prop in entry) {
                    if (query.hasOwnProperty(prop)) {
                        const targetValue = query[prop];
                        // Perform lowercase search, if value is string
                        if (typeof targetValue === 'string' && typeof entry[prop] === 'string') {
                            if (targetValue.toLocaleLowerCase() !== entry[prop].toLocaleLowerCase()) {
                                match = false;
                                break;
                            }
                        } else if (targetValue != entry[prop]) {
                            match = false;
                            break;
                        }
                    }
                }

                if (match) {
                    result.push(Object.assign(deepCopy(entry), { _id: key }));
                }
            }

            return result;
        }

        return { get, add, set, merge, delete: del, query };
    }


    function assignSystemProps(target, entry, ...rest) {
        const whitelist = [
            '_id',
            '_createdOn',
            '_updatedOn',
            '_ownerId'
        ];
        for (let prop of whitelist) {
            if (entry.hasOwnProperty(prop)) {
                target[prop] = deepCopy(entry[prop]);
            }
        }
        if (rest.length > 0) {
            Object.assign(target, ...rest);
        }

        return target;
    }


    function assignClean(target, entry, ...rest) {
        const blacklist = [
            '_id',
            '_createdOn',
            '_updatedOn',
            '_ownerId'
        ];
        for (let key in entry) {
            if (blacklist.includes(key) == false) {
                target[key] = deepCopy(entry[key]);
            }
        }
        if (rest.length > 0) {
            Object.assign(target, ...rest);
        }

        return target;
    }

    function deepCopy(value) {
        if (Array.isArray(value)) {
            return value.map(deepCopy);
        } else if (typeof value == 'object') {
            return [...Object.entries(value)].reduce((p, [k, v]) => Object.assign(p, { [k]: deepCopy(v) }), {});
        } else {
            return value;
        }
    }

    var storage = initPlugin;

    const { ConflictError: ConflictError$1, CredentialError: CredentialError$1, RequestError: RequestError$2 } = errors;

    function initPlugin$1(settings) {
        const identity = settings.identity;

        return function decorateContext(context, request) {
            context.auth = {
                register,
                login,
                logout
            };

            const userToken = request.headers['x-authorization'];
            if (userToken !== undefined) {
                let user;
                const session = findSessionByToken(userToken);
                if (session !== undefined) {
                    const userData = context.protectedStorage.get('users', session.userId);
                    if (userData !== undefined) {
                        console.log('Authorized as ' + userData[identity]);
                        user = userData;
                    }
                }
                if (user !== undefined) {
                    context.user = user;
                } else {
                    throw new CredentialError$1('Invalid access token');
                }
            }

            function register(body) {
                if (body.hasOwnProperty(identity) === false ||
                    body.hasOwnProperty('password') === false ||
                    body[identity].length == 0 ||
                    body.password.length == 0) {
                    throw new RequestError$2('Missing fields');
                } else if (context.protectedStorage.query('users', { [identity]: body[identity] }).length !== 0) {
                    throw new ConflictError$1(`A user with the same ${identity} already exists`);
                } else {
                    const newUser = Object.assign({}, body, {
                        [identity]: body[identity],
                        hashedPassword: hash(body.password)
                    });
                    const result = context.protectedStorage.add('users', newUser);
                    delete result.hashedPassword;

                    const session = saveSession(result._id);
                    result.accessToken = session.accessToken;

                    return result;
                }
            }

            function login(body) {
                const targetUser = context.protectedStorage.query('users', { [identity]: body[identity] });
                if (targetUser.length == 1) {
                    if (hash(body.password) === targetUser[0].hashedPassword) {
                        const result = targetUser[0];
                        delete result.hashedPassword;

                        const session = saveSession(result._id);
                        result.accessToken = session.accessToken;

                        return result;
                    } else {
                        throw new CredentialError$1('Email or password don\'t match');
                    }
                } else {
                    throw new CredentialError$1('Email or password don\'t match');
                }
            }

            function logout() {
                if (context.user !== undefined) {
                    const session = findSessionByUserId(context.user._id);
                    if (session !== undefined) {
                        context.protectedStorage.delete('sessions', session._id);
                    }
                } else {
                    throw new CredentialError$1('User session does not exist');
                }
            }

            function saveSession(userId) {
                let session = context.protectedStorage.add('sessions', { userId });
                const accessToken = hash(session._id);
                session = context.protectedStorage.set('sessions', session._id, Object.assign({ accessToken }, session));
                return session;
            }

            function findSessionByToken(userToken) {
                return context.protectedStorage.query('sessions', { accessToken: userToken })[0];
            }

            function findSessionByUserId(userId) {
                return context.protectedStorage.query('sessions', { userId })[0];
            }
        };
    }


    const secret = 'This is not a production server';

    function hash(string) {
        const hash = crypto__default['default'].createHmac('sha256', secret);
        hash.update(string);
        return hash.digest('hex');
    }

    var auth = initPlugin$1;

    function initPlugin$2(settings) {
        const util = {
            throttle: false
        };

        return function decoreateContext(context, request) {
            context.util = util;
        };
    }

    var util$2 = initPlugin$2;

    /*
     * This plugin requires auth and storage plugins
     */

    const { RequestError: RequestError$3, ConflictError: ConflictError$2, CredentialError: CredentialError$2, AuthorizationError: AuthorizationError$2 } = errors;

    function initPlugin$3(settings) {
        const actions = {
            'GET': '.read',
            'POST': '.create',
            'PUT': '.update',
            'PATCH': '.update',
            'DELETE': '.delete'
        };
        const rules = Object.assign({
            '*': {
                '.create': ['User'],
                '.update': ['Owner'],
                '.delete': ['Owner']
            }
        }, settings.rules);

        return function decorateContext(context, request) {
            // special rules (evaluated at run-time)
            const get = (collectionName, id) => {
                return context.storage.get(collectionName, id);
            };
            const isOwner = (user, object) => {
                return user._id == object._ownerId;
            };
            context.rules = {
                get,
                isOwner
            };
            const isAdmin = request.headers.hasOwnProperty('x-admin');

            context.canAccess = canAccess;

            function canAccess(data, newData) {
                const user = context.user;
                const action = actions[request.method];
                let { rule, propRules } = getRule(action, context.params.collection, data);

                if (Array.isArray(rule)) {
                    rule = checkRoles(rule, data);
                } else if (typeof rule == 'string') {
                    rule = !!(eval(rule));
                }
                if (!rule && !isAdmin) {
                    throw new CredentialError$2();
                }
                propRules.map(r => applyPropRule(action, r, user, data, newData));
            }

            function applyPropRule(action, [prop, rule], user, data, newData) {
                // NOTE: user needs to be in scope for eval to work on certain rules
                if (typeof rule == 'string') {
                    rule = !!eval(rule);
                }

                if (rule == false) {
                    if (action == '.create' || action == '.update') {
                        delete newData[prop];
                    } else if (action == '.read') {
                        delete data[prop];
                    }
                }
            }

            function checkRoles(roles, data, newData) {
                if (roles.includes('Guest')) {
                    return true;
                } else if (!context.user && !isAdmin) {
                    throw new AuthorizationError$2();
                } else if (roles.includes('User')) {
                    return true;
                } else if (context.user && roles.includes('Owner')) {
                    return context.user._id == data._ownerId;
                } else {
                    return false;
                }
            }
        };



        function getRule(action, collection, data = {}) {
            let currentRule = ruleOrDefault(true, rules['*'][action]);
            let propRules = [];

            // Top-level rules for the collection
            const collectionRules = rules[collection];
            if (collectionRules !== undefined) {
                // Top-level rule for the specific action for the collection
                currentRule = ruleOrDefault(currentRule, collectionRules[action]);

                // Prop rules
                const allPropRules = collectionRules['*'];
                if (allPropRules !== undefined) {
                    propRules = ruleOrDefault(propRules, getPropRule(allPropRules, action));
                }

                // Rules by record id 
                const recordRules = collectionRules[data._id];
                if (recordRules !== undefined) {
                    currentRule = ruleOrDefault(currentRule, recordRules[action]);
                    propRules = ruleOrDefault(propRules, getPropRule(recordRules, action));
                }
            }

            return {
                rule: currentRule,
                propRules
            };
        }

        function ruleOrDefault(current, rule) {
            return (rule === undefined || rule.length === 0) ? current : rule;
        }

        function getPropRule(record, action) {
            const props = Object
                .entries(record)
                .filter(([k]) => k[0] != '.')
                .filter(([k, v]) => v.hasOwnProperty(action))
                .map(([k, v]) => [k, v[action]]);

            return props;
        }
    }

    var rules = initPlugin$3;

    var identity = "email";
    var protectedData = {
        users: {
            "35c62d76-8152-4626-8712-eeb96381bea8": {
                email: "peter@abv.bg",
                username: "Peter",
                hashedPassword: "83313014ed3e2391aa1332615d2f053cf5c1bfe05ca1cbcb5582443822df6eb1"
            },
            "847ec027-f659-4086-8032-5173e2f9c93a": {
                email: "george@abv.bg",
                username: "George",
                hashedPassword: "83313014ed3e2391aa1332615d2f053cf5c1bfe05ca1cbcb5582443822df6eb1"
            },
            "60f0cf0b-34b0-4abd-9769-8c42f830dffc": {
                email: "admin@abv.bg",
                username: "Admin",
                hashedPassword: "fac7060c3e17e6f151f247eacb2cd5ae80b8c36aedb8764e18a41bbdc16aa302"
            }
        },
        sessions: {
        }
    };
    var seedData = {
        comicsInfo: [
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-000.jpg?alt=media",
                title: "American Vampire",
                slogan: "Second Cycle",
                creators: "Scott Snyder (Author) , Rafael Albuquerque (Illustrator)",
                info: "The Eisner Award-winning, critically acclaimed series continues into a second volume. The tale of Pearl Jones and Skinner Sweet, both new breeds of vampire, enters a new era filled with new enemies, new allies, and a new decade, the 1960s!",
                currentPrice: "5.20",
                oldPrice: "",
                createdAt: "2024-05-01T07:22:00.358Z",
                ratingId: "dc79c140-f0fe-4877-b751-3ca8a3aafc6a",
                _id: "dc79c140-f0fe-4877-b751-3ca8a3aafc6a",
                _createdOn: 1613551275612,
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F001.jpg?alt=media",
                title: "Birthright",
                slogan: "Live By The Sword",
                creators: "Joshua Williamson (Author), Andrei Bressan (Cover Art, Artist)",
                info: "July 1st, 1946: Two park rangers made first contact with a magical creature. Now Mikey Rhodes must uncover the secret history of magic on Earth if he is to save it from certain doom. Collects BIRTHRIGHT #36-40",
                currentPrice: "3.90",
                oldPrice: "4.80",
                createdAt: "2025-11-16T07:22:00.358Z",
                ratingId: "36f9c859-3ed5-4405-82c7-0741b2085863",
                _id: "36f9c859-3ed5-4405-82c7-0741b2085863",
                _createdOn: 1613551852012
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-000.jpg?alt=media",
                title: "Predator",
                slogan: "Prey to the Heavens",
                creators: "John Arcudi (Author), Javier Saltares (Artist), Wes Dzioba (Artist)",
                info: "The world's attention is focused painfully on a brutal third-world civil war, a merciless sectarian conflict sparing neither soldier nor civilian, grandmother nor child. But amidst the terror and carnage, where great nations and powerful interests jockey for position and advantage, another blood feud rages in the shadows, one no more humane, but decidedly less human. Two warring tribes from the stars have chosen Earth's killing fields as their arena, with each clan sworn to eradicate the other - and all who stand between them! Each is the other's prey, each the other's Predator. The hunt resumes as Dark Horse Books unleashes Predator once again into the graphic-fiction jungle. Features the creative team of writer John Arcudi (Aliens, B.P.R.D., Doom Patrol) and artist Javier Saltares (Aliens vs. Predator, Ghost Rider).",
                currentPrice: "3.99",
                oldPrice: "",
                createdAt: "2025-12-18T07:22:00.358Z",
                ratingId: "71bfcd5b-b962-4229-8e6f-de2e427fe69d",
                _id: "71bfcd5b-b962-4229-8e6f-de2e427fe69d",
                _createdOn: 1613551226812
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-000.jpg?alt=media",
                title: "Half Past Danger",
                slogan: "Vol. 1",
                creators: "Stephen Mooney (Author, Artist)",
                info: "Summer, 1943, and in the midst of a war waged by monsters, Staff Sergeant Tommy “Irish” Flynn never expected to encounter a real one. But on a remote island in the South Pacific theatre, Flynn and his squad come face-to-fanged-face with creatures long thought dead. As the world falls apart, a unique set of characters come together: An embittered Irishman in a war not his own, a beautiful and enigmatic British agent, a U.S. Marine Captain with incredible resilience and a secret, and a mysterious operative from the land of the Rising Sun, all served up in a stew of piping-hot Nazi intrigue. History meets Prehistory in this two-fisted race against time. And there ain’t no time like Half Past Danger!",
                currentPrice: "4.70",
                oldPrice: "5.00",
                createdAt: "2024-04-01T07:22:00.358Z",
                ratingId: "71bfcd5b-b962-4229-8e6f-de2e427th69d",
                _id: "71bfcd5b-b962-4229-8e6f-de2e427th69d",
                _createdOn: 1613551245812
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0000.jpg?alt=media",
                title: "Assassin's Creed Valhalla",
                slogan: "Song of Glory",
                creators: "Cavan Scott (Author), Martin Tunica (Illustrator), Michael Atiyeh (Illustrator)",
                info: "Tensions escalate when a village caught between two rival kingdoms is brutally raided. Eivor, warrior and daughter of wise King Styrbjorn, dispatches the raiders, rescues the villagers, and claims the settlement for her father. She also seizes a prisoner--a woman, Gull, left behind by the rivals--who declares she possesses the secrets of Asgard itself. But there is more to Gull than meets the eye, and her capture will bring death and destruction to Eivor's family. In disgrace and lured by the promise of treasures and glory, Eivor undergoes a dangerous quest to regain her honor, but what terror awaits in the forgotten temple of a powerful god? All the time, her brother Sigurd forges his own legend while searching for fortune in the lands of the East. Far from home, he finds new weapons and fresh plunder, making a discovery that will change his destiny forever . . .",
                currentPrice: "4.60",
                oldPrice: "",
                createdAt: "2024-03-01T07:22:00.358Z",
                ratingId: "d239fb5b-f90a-4862-9162-f9e9f6757683",
                _id: "d239fb5b-f90a-4862-9162-f9e9f6757683",
                _createdOn: 1613555749012
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-000.jpg?alt=media",
                title: "Promethee",
                slogan: "Vol. 1 - Atlantis",
                creators: "Christophe Bec (Author, Artist), Edward Gauvin (Translator), Sébastien Gérard (Colorist)",
                info: "September 21st, 2019 - 13:13 pm After a successful take-off, the Atlantis Shuttle disappears mysteriously from control screens. September 22nd, 2019 - 13:13 pm All the timepieces (watches, clocks...) on the planet suddenly stop. September 23rd, 2019 - 13:13 pm The Atlantis Shuttle reappears and lands in Cape Canaveral, with only one survivor is on board: the commanding officer of the mission is found in a state of shock right in the middle of his crew's torn appart corpses. September 24th, 2019 - 13:13 pm An American nuclear submarine gets the echo sonar of a German U-boat that had disappeared sixty eight years earlier... In open sea, a trawler discovers the monumental hull of the Titanic, that sank in the same place, 650 km in the Southeast of Newfoundland. And that's just a beginning... As the threat of Apocalypse hangs over the whole planet, it would seem that the future of Humanity has plunged into obscurity... presaging the worst for our civilisation.",
                currentPrice: "6.50",
                oldPrice: "",
                createdAt: "2024-02-15T07:22:00.358Z",
                ratingId: "71bfcd5b-b962-4229-8e6f-de2s727fe69d",
                _id: "71bfcd5b-b962-4229-8e6f-de2s727fe69d",
                _createdOn: 1613551253212
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-000.jpg?alt=media",
                title: "War of the World War One",
                slogan: "Vol. 1 - The Thing Below the Trenches",
                creators: "Richard D. Nolane (Author), Pierre Loyvet (Cover Art), Christina Cox-De Ravel (Translator), Zeljko Vladetic (Artist), Aurore Folny (Colorist)",
                info: "In 1916, during the battle of Verdun, a huge German mine destroys an important French fort and kills general Nivelle. However, the explosion uncovers a strange and massive machine which had been buried in the ground beneath the fort for centuries. Protected by a force field, the machine suddenly sends a message into Space – a message that will awaken what is hidden under the dead cities of the planet Mars...",
                currentPrice: "5.55",
                oldPrice: "",
                createdAt: "2025-02-10T07:22:00.358Z",
                ratingId: "71bfcd5b-b962-4229-8e6f-de2s687fe69d",
                _id: "71bfcd5b-b962-4229-8e6f-de2s687fe69d",
                _createdOn: 1613551275312
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-000-(2020)-(Digital)-(Mephisto-Empire)-000.jpg?alt=media",
                title: "The Red Mother",
                slogan: "Vol. 3",
                creators: "Jeremy Haun (Author), Danny Luckert (Illustrator)",
                info: "THE RED MOTHER HAS ARRIVED. Daisy takes her final steps towards unlocking the path to the Red Court and confronting the terrifying force behind the horrors inflicted upon her. Now the Red Mother’s true plan will be revealed and the fate of our world rests in Daisy’s hand. Writer Jeremy Haun (The Beauty, The Realm) and artist Danny Luckert (Regression) present the unforgettable conclusion of their acclaimed horror series revealing the hidden terrors in the world around us. Collects The Red Mother #9-12.",
                currentPrice: "3.86",
                oldPrice: "4.89",
                createdAt: "2024-04-01T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b653-3d422c519f33",
                _id: "09bb4abb-ad24-438c-b653-3d422c519f33",
                _createdOn: 1613551236512
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-000.jpg?alt=media",
                title: "Venus",
                slogan: "",
                creators: "Rick Loverd (Author), Huang Danlan (Artist)",
                info: "Science fact and science fiction collide in this new story from Rick Loverd, Program Director for The Science and Entertainment Exchange, an organization that pairs expert scientists with storytellers. In 2150, Earth’s resources have been depleted and countries race to outer space to mine what they need from other planets. A group of Americans making its way to Venus crash-lands on the planet, forcing them to do whatever it takes to navigate the harsh landscape in their journey to find the science base they were flying toward. In the vein of great adventure survival stories like Lost and The Martian, there’s only one reality on Venus—adapt or die. Collects the complete limited series. “Venus puts the science back in science fiction in a meaningful, fascinating way.” - Ron Marz (Witchblade)",
                currentPrice: "5.30",
                oldPrice: "",
                createdAt: "2025-03-02T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b653-3d456h719f33",
                _id: "09bb4abb-ad24-438c-b653-3d456h719f33",
                _createdOn: 1613551215412
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-000.jpg?alt=media",
                title: "Aliens",
                slogan: "More than Human",
                creators: "John Arcudi (Author), Zach Howard (Artist), Mark Irwin (Artist), Wes Dzioba (Artist)",
                info: "A group of wildcat planetary prospectors plant their flag on a distant new world, rich in land, resources . . .and the greatest archaeological discovery in history, an ancient complex of impossible proportions carved deep within the living rock, a mind-numbing labyrinth of passages, ramps, bridges, and galleries that seems to extend limitlessly. But as the exploration of the leviathan dead city proceeds deeper and deeper, the members of the team slowly begin to lose their grip on reality, and madness gives way to fear as the explorers begin to disappear. Something else lives within the necropolis, a faceless horror as deadly and merciless as space itself, a lethal terror that has waited centuries to awake - and destroy! Dark Horse Books heralds the return to graphic fiction of the heavyweight champion of modern science-fiction/horror, Aliens! Features the top-flight creative team of writer John Arcudi (The Mask, B.P.R.D., Doom Patrol), penciller Zach Howard (Shaun of the Dead, Outer Orbit), and inker Mark Irwin (X-Men: Age of Apocalypse, Batman, The Amazing Spider-Man).",
                currentPrice: "3.69",
                oldPrice: "5.40",
                createdAt: "2023-11-01T07:22:00.358Z",
                ratingId: "02901320-de01-4ab5-a7ac-f6b2bd71f5c0",
                _id: "02901320-de01-4ab5-a7ac-f6b2bd71f5c0",
                _createdOn: 1613551246312
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://pixeldrain.com/api/file/9jiq8z55",
                title: "Harbinger Deluxe Edition",
                slogan: "Vol. 1",
                creators: "Joshua Dysart (Author), Khari Evans (Artist), Trevor Hairsine (Artist), Mico Suayan (Artist), Barry Kitson (Artist), Phil Briones (Artist), Lee Garbett (Artist), Pere Perez (Artist), Matthew Clark (Artist) ",
                info: "Outside the law. Inside your head. You've never met a team of super-powered teenagers quite like the Renegades. Skipping across the country in a desperate attempt to stay one step ahead of the authorities, psionically-powered teenager Peter Stanchek only has one option left - run. But he won't have to go it alone. As the shadowy corporation known as the Harbinger Foundation draws close on all sides, Peter will have to find and recruit other unique individuals like himself... other troubled, immensely powerful youths with abilities beyond their control. Their mission? Bring the fight back to the Harbinger Foundation's founder Toyo Harada - and dismantle his global empire brick by brick... Collecting the sold-out HARBINGER #0-14, the Harbinger Deluxe Edition Vol. 1 also comes jam-packed with more than 20 pages of never-before-seen art and extras, direct from the Valiant vaults.",
                currentPrice: "5.90",
                oldPrice: "6.30",
                createdAt: "2025-01-14T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b863-3d456h719f33",
                _id: "09bb4abb-ad24-438c-b863-3d456h719f33",
                _createdOn: 1613551785012
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://pixeldrain.com/api/file/9qMSWDtg",
                title: "Clone",
                slogan: "Vol. 1 - First Generation",
                creators: "DavidSchulner (Author)",
                info: "From Robert Kirkman's Skybound imprint comes a sci-fi story like you've never seen before! Dr. Luke Taylor's perfect life comes to a dramatic halt when an identical, bloodied version of himself arrives at his doorstep with news that he is one of many clones... and they're all after his pregnant wife and their unborn child! being adapted into TV by Universal",
                currentPrice: "3.80",
                oldPrice: "4.30",
                createdAt: "2024-12-18T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b863-3d4fuyfd5f33",
                _id: "09bb4abb-ad24-438c-b863-3d4fuyfd5f33",
                _createdOn: 1613551237412
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://pixeldrain.com/api/file/mzA34QQc",
                title: "Dragon Age",
                slogan: "Wraiths of Tevinter",
                creators: "Nunzio DeFilippis (Author), Christina Weir (Author), Fernando Heinz Furukawa (Illustrator), Michael Atiyeh (Illustrator)",
                info: "The trilogy that pits Fenris and the Inquisition against the Venatori for the fate of Thedas collected in a top-quality, oversized hardcover! BioWare’s game of the year award-winning dark fantasy RPG Dragon Age: Inquisition gets a canonical continuation in this collection of Dragon Age: Deception, Dragon Age: Blue Wraith, and Dragon Age: Dark Fortress. When a red lyrium artifact of devastating power surfaces in the Tevinter Imperium, the Inquisition mobilizes knight Ser Aaron Hawthorne, elven thief Vaea, and magekillers Tessa Forsythia and Marius to retrieve it. Along the way, they will acquire a fledgling con artist and a troubled mage as allies, as well as Fenris, the legendary Blue Wraith. But the Venatori have mobilized forces of their own, and it will take cunning, bravery, and sacrifice to stop their dark intentions from being realized.",
                currentPrice: "5.30",
                oldPrice: "",
                createdAt: "2024-08-15T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b863-3d4fuyffd9d3",
                _id: "09bb4abb-ad24-438c-b863-3d4fuyffd9d3",
                _createdOn: 1613551483012
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://pixeldrain.com/api/file/nX2RRwua",
                title: "Beasts of Burden",
                slogan: "Occupied Territory",
                creators: "Evan Dorkin (Author), Ben Dewey (Illustrator)",
                info: "This eight-time Eisner Award–winning comic book series blending fantasy and humor returns in a historical adventure blending Japanese and Western occult! An elder member of the occult-battling pack of Wise Dogs recalls a harrowing mission—in U.S-occupied Japan after World War II, a mysterious curse creates an army of crawling, disembodied heads which threatens to overwhelm the region. Emrys and a team of canine companions attempt to solve the mystery, bringing them into conflict with shape-changing tanuki, evil oni, and a horde of vengeful demons. This volume collects the comic-book series Beasts of Burden: Occupied Territory issues #1–#4, published by Dark Horse Comics.",
                currentPrice: "5.30",
                oldPrice: "6.00",
                createdAt: "2025-04-15T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b863-3d4fgpekt9d3",
                _id: "09bb4abb-ad24-438c-b863-3d4fgpekt9d3",
                _createdOn: 1613551354012
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://pixeldrain.com/api/file/5YTYxpMB",
                title: "Bear's Tooth",
                slogan: "Vol. 4 - Amerika Bomber",
                creators: "Yann (Author), Alain Henriet (Illustrator) ",
                info: "Allied bombers have flattened the secret base that housed the Amerika Bomber project, destroying both the infrastructures and the prototype flying wing that was to annihilate New York City. They did not, however, manage to kill either Anna Reitsch or Max/Werner. Much to the latter’s horror, though, it turns out there is a second prototype – and the operation is still a go. Meanwhile, Americans and Soviets begin a frantic race to get their hands on the best German rocket and nuclear scientists …",
                currentPrice: "4.60",
                oldPrice: "",
                createdAt: "2024-08-10T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b863-hj67djpekt9d3",
                _id: "09bb4abb-ad24-438c-b863-hj67djpekt9d3",
                _createdOn: 1613551279248
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://pixeldrain.com/api/file/RKeDvf8S",
                title: "Armorclads",
                slogan: "",
                creators: "Brian Buccellato (Author), J.J. O'Connor (Author), Manuel Garcia (Artist) ",
                info: "Explore a brand new corner of the Valiant Universe! In a distant solar system, advanced mechs known as Armorclads are used to fight wars and build worlds. On Xeru, genetically engineered workers live out their short lives mining a valuable mineral called The Pure in construction-class mechs known as Ironclads. When one of their own is killed, the Ironclads' world is turned upside down and they defy their oppressors. Along the way, they'll discover they're embroiled in a mystery dating back centuries that could change the world forever-as long as they band together.",
                currentPrice: "4.20",
                oldPrice: "",
                createdAt: "2024-10-24T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b863-hj6pjg5f6t9d3",
                _id: "09bb4abb-ad24-438c-b863-hj6pjg5f6t9d3",
                _createdOn: 1613551212312
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://pixeldrain.com/api/file/Bf1fwS2Y",
                title: "Alix Senator - Vol. 1",
                slogan: "The Blood Eagles",
                creators: "Created by Jacques Martin, Valerie Mangin, Thierry Demarez",
                info: "12 BC. Marcus Aemilius Lepidus, high priest of Rome and Agrippa the designated successor to the powerful Emperor Augustus, are mysteriously killed by eagles that tear at their bowels. Alarmed by these events, Augustus asks his old friend Senator Gracchus Alix to investigate discreetly. Alix leads an investigation, assisted by his son Titus and Chephren (the son of the late  Enak  who Alix adopted ) on the trail of the enigmatic master of birds. Yet the danger persists in even closer to the emperor, getting more and more closely to him. Alix and will eventually discover that the most dangerous raptors have nestled in the heart of Rome, where no one could suspect …",
                currentPrice: "5.25",
                oldPrice: "5.80",
                createdAt: "2024-10-24T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b863-hjkiebt6f6t9d3",
                _id: "09bb4abb-ad24-438c-b863-hjkiebt6f6t9d3",
                _createdOn: 1613551236812
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://pixeldrain.com/api/file/igjabTJL",
                title: "Alice Matheson - Vol. 2",
                slogan: "The Killer in me",
                creators: "Jean-Luc Istin (Author), Christina Cox-De Ravel (Translator), Živorad Radivojević (Artist), Jean Bastide (Colorist) ",
                info: "The noose is tightening around Alice, our favorite psychopath nurse! Between Dr. Barry, who is becoming more and more audacious, Nurse Alexandra Paynes, who caught her killing a patient, and a strange guy called Harold Butler, who said he met her before, Alice is going through a bad phase which almost makes her forget the zombies! And now it appears that the cause of the epidemic could come from the hospital itself...",
                currentPrice: "5.60",
                oldPrice: "",
                createdAt: "2025-01-24T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b863-hjkiuj7thggjk4",
                _id: "09bb4abb-ad24-438c-b863-hjkiuj7thggjk4",
                _createdOn: 1613551267112
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://pixeldrain.com/api/file/QPKQBe7U",
                title: "A Reckless Book",
                slogan: "Destroy All Monsters",
                creators: "Ed Brubaker (Author), Sean Phillips (Artist), Jacob Phillips (Artist) ",
                info: "It's 1988, and Ethan has been hired for his strangest case yet: finding the secrets of a Los Angeles real estate mogul. How hard could that be, right? But what starts as a deep dive into the life of a stranger will soon take a deadly turn, and Ethan will risk everything that still matters to him.",
                currentPrice: "6.30",
                oldPrice: "",
                createdAt: "2024-05-24T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b863-hjkgjhg55hggjk4",
                _id: "09bb4abb-ad24-438c-b863-hjkgjhg55hggjk4",
                _createdOn: 1613551237412
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://pixeldrain.com/api/file/Ga3kgU4T",
                title: "A Game of Thrones The Graphic Novel",
                slogan: "Volume 1",
                creators: "George R. R. Martin (Author), Tommy Patterson (Illustrator) ",
                info: "You’ve read the books. You’ve watched the hit series on HBO. Now acclaimed novelist Daniel Abraham and illustrator Tommy Patterson bring George R. R. Martin’s epic fantasy masterwork A Game of Thrones to majestic new life in the pages of this full-color graphic novel, comprised of the initial six issues of the graphic series.",
                currentPrice: "5.65",
                oldPrice: "6.00",
                createdAt: "2024-10-04T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b863-hoknbtcfegjk43",
                _id: "09bb4abb-ad24-438c-b863-hoknbtcfegjk43",
                _createdOn: 1613551263412
            },
            {
                _ownerId: "35c62d76-8152-4626-8712-eeb96381bea8",
                coverUrl: "https://pixeldrain.com/api/file/23iio5dj",
                title: "Дъга",
                slogan: "Разкази в Картинки - брой 40",
                creators: "Венелин Върбанов,Владимир Недялков, Георги Шуменов, Димитър Стоянов – Димо и др.",
                info: "„Дъга – разкази в картинки“ е българско детско комикс списание, издавано от Държавно издателство „Септември“, София. Първият му брой излиза в края на 1979 година.[1] Въпреки огромното външно влияние, списанието създава свой собствен стил и е класически образ на българската илюстрация за това време. „Дъга“ набира огромна популярност през 1980-те години, когато тиражът му достига 180 000 бр. В списанието са събрани колекции от комикс сериали на много български илюстратори, детски писатели и аниматори, сред които Доньо Донев, Румен Петков и Борис Димовски.",
                currentPrice: "10.00",
                oldPrice: "12.56",
                createdAt: "2024-10-04T07:22:00.358Z",
                ratingId: "09bb4abb-ad24-438c-b863-hoknbcfgedfghr",
                _id: "09bb4abb-ad24-438c-b863-hoknbcfgedfghr",
                _createdOn: 1613551247312
            }
        ],
        comments: [
            {
                "_ownerId": "35c62d76-8152-4626-8712-eeb96381bea8",
                "text": "Absolutely loved the artwork in this one! The colors and details were stunning.",
                "comicId": "0",
                "_createdOn": 1743355937311,
                "_id": "3c04d5a7-d35a-4f50-aa10-03ebe487e314"
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "text": "The plot twists had me on the edge of my seat—totally didn’t see that coming!",
                "comicId": "1",
                "_createdOn": 1743355937312,
                "_id": "3c04d5a7-d35a-4f50-aa10-03ebe487e314"
            },
            {
                "_ownerId": "35c62d76-8152-4626-8712-eeb96381bea8",
                "text": "A solid read, but I wish the character development was a bit stronger.",
                "comicId": "3",
                "_createdOn": 1743355937313,
                "_id": "3c04d5a7-d35a-4f50-aa10-03ebe487e314"
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "text": "This comic is a masterpiece. The storytelling is top-tier, and the pacing is perfect!",
                "comicId": "2",
                "_createdOn": 1743355937314,
                "_id": "3c04d5a7-d35a-4f50-aa10-03ebe487e314"
            },
            {
                "_ownerId": "35c62d76-8152-4626-8712-eeb96381bea8",
                "text": "Not my cup of tea, but I can appreciate the effort put into the world-building.",
                "comicId": "2",
                "_createdOn": 1743355937315,
                "_id": "3c04d5a7-d35a-4f50-aa10-03ebe487e314"
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "text": "The dialogue felt a little forced at times, but overall, it was a fun ride!",
                "comicId": "3",
                "_createdOn": 1743355937316,
                "_id": "3c04d5a7-d35a-4f50-aa10-03ebe487e314"
            },
            {
                "_ownerId": "35c62d76-8152-4626-8712-eeb96381bea8",
                "text": "I couldn’t put this down! The action sequences were so well done.",
                "comicId": "1",
                "_createdOn": 1743355937317,
                "_id": "3c04d5a7-d35a-4f50-aa10-03ebe487e314"
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "text": "The ending left me with so many questions—I need the next issue ASAP!",
                "comicId": "4",
                "_createdOn": 1743355937318,
                "_id": "3c04d5a7-d35a-4f50-aa10-03ebe487e314"
            },
            {
                "_ownerId": "35c62d76-8152-4626-8712-eeb96381bea8",
                "text": "Great mix of humor and drama. Definitely adding this to my collection.",
                "comicId": "4",
                "_createdOn": 1743355937319,
                "_id": "3c04d5a7-d35a-4f50-aa10-03ebe487e314"
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "text": "The villain in this story is so well-written, I almost started rooting for them!",
                "comicId": "5",
                "_createdOn": 1743355937321,
                "_id": "3c04d5a7-d35a-4f50-aa10-03ebe487e314"
            }
        ],
        comicContent: [
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "dc79c140-f0fe-4877-b751-3ca8a3aafc6a",
                "_createdOn": 1743355937321,
                "_id": "dc79c140-f0fe-4877-b751-3ca8a3aafc6a",

                "comicContent": {
                    "1": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-000.jpg?alt=media",
                    "2": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-001.jpg?alt=media",
                    "3": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-002.jpg?alt=media",
                    "4": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-003.jpg?alt=media",
                    "5": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-004.jpg?alt=media",
                    "6": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-005.jpg?alt=media",
                    "7": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-006.jpg?alt=media",
                    "8": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-007.jpg?alt=media",
                    "9": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-008.jpg?alt=media",
                    "10": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-009.jpg?alt=media",
                    "11": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-010.jpg?alt=media",
                    "12": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-011.jpg?alt=media",
                    "13": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-012.jpg?alt=media",
                    "14": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-013.jpg?alt=media",
                    "15": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-014.jpg?alt=media",
                    "16": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-015.jpg?alt=media",
                    "17": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-016.jpg?alt=media",
                    "18": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-017.jpg?alt=media",
                    "19": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-018.jpg?alt=media",
                    "20": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-019.jpg?alt=media",
                    "21": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-020.jpg?alt=media",
                    "22": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-021.jpg?alt=media",
                    "23": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-022.jpg?alt=media",
                    "24": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-023.jpg?alt=media",
                    "25": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-024.jpg?alt=media",
                    "26": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-025.jpg?alt=media",
                    "27": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-026.jpg?alt=media",
                    "28": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-027.jpg?alt=media",
                    "29": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-028.jpg?alt=media",
                    "30": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-029.jpg?alt=media",
                    "31": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-030.jpg?alt=media",
                    "32": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-031.jpg?alt=media",
                    "33": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-032.jpg?alt=media",
                    "34": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-033.jpg?alt=media",
                    "35": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-034.jpg?alt=media",
                    "36": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-035.jpg?alt=media",
                    "37": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-036.jpg?alt=media",
                    "38": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-037.jpg?alt=media",
                    "39": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-038.jpg?alt=media",
                    "40": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-039.jpg?alt=media",
                    "41": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-040.jpg?alt=media",
                    "42": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-041.jpg?alt=media",
                    "43": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-042.jpg?alt=media",
                    "44": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-043.jpg?alt=media",
                    "45": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-044.jpg?alt=media",
                    "46": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-045.jpg?alt=media",
                    "47": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-046.jpg?alt=media",
                    "48": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-047.jpg?alt=media",
                    "49": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-048.jpg?alt=media",
                    "50": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-049.jpg?alt=media",
                    "51": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-050.jpg?alt=media",
                    "52": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-051.jpg?alt=media",
                    "53": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-052.jpg?alt=media",
                    "54": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-053.jpg?alt=media",
                    "55": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-054.jpg?alt=media",
                    "56": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-055.jpg?alt=media",
                    "57": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-056.jpg?alt=media",
                    "58": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-057.jpg?alt=media",
                    "59": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-058.jpg?alt=media",
                    "60": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-059.jpg?alt=media",
                    "61": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-060.jpg?alt=media",
                    "62": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-061.jpg?alt=media",
                    "63": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-062.jpg?alt=media",
                    "64": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-063.jpg?alt=media",
                    "65": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-064.jpg?alt=media",
                    "66": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-065.jpg?alt=media",
                    "67": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-066.jpg?alt=media",
                    "68": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-067.jpg?alt=media",
                    "69": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-068.jpg?alt=media",
                    "70": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-069.jpg?alt=media",
                    "71": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-070.jpg?alt=media",
                    "72": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-071.jpg?alt=media",
                    "73": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-072.jpg?alt=media",
                    "74": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-073.jpg?alt=media",
                    "75": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-074.jpg?alt=media",
                    "76": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-075.jpg?alt=media",
                    "77": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-076.jpg?alt=media",
                    "78": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-077.jpg?alt=media",
                    "79": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-078.jpg?alt=media",
                    "80": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-079.jpg?alt=media",
                    "81": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-080.jpg?alt=media",
                    "82": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-081.jpg?alt=media",
                    "83": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-082.jpg?alt=media",
                    "84": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-083.jpg?alt=media",
                    "85": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-084.jpg?alt=media",
                    "86": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-085.jpg?alt=media",
                    "87": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-086.jpg?alt=media",
                    "88": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-087.jpg?alt=media",
                    "89": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-088.jpg?alt=media",
                    "90": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-089.jpg?alt=media",
                    "91": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-090.jpg?alt=media",
                    "92": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-091.jpg?alt=media",
                    "93": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-092.jpg?alt=media",
                    "94": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-093.jpg?alt=media",
                    "95": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-094.jpg?alt=media",
                    "96": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-095.jpg?alt=media",
                    "97": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-096.jpg?alt=media",
                    "98": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-097.jpg?alt=media",
                    "99": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-098.jpg?alt=media",
                    "100": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-099.jpg?alt=media",
                    "101": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-100.jpg?alt=media",
                    "102": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-101.jpg?alt=media",
                    "103": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-102.jpg?alt=media",
                    "104": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-103.jpg?alt=media",
                    "105": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-104.jpg?alt=media",
                    "106": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-105.jpg?alt=media",
                    "107": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-106.jpg?alt=media",
                    "108": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-107.jpg?alt=media",
                    "109": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-108.jpg?alt=media",
                    "110": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-109.jpg?alt=media",
                    "111": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-110.jpg?alt=media",
                    "112": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-111.jpg?alt=media",
                    "113": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-112.jpg?alt=media",
                    "114": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-113.jpg?alt=media",
                    "115": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-114.jpg?alt=media",
                    "116": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-115.jpg?alt=media",
                    "117": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-116.jpg?alt=media",
                    "118": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-117.jpg?alt=media",
                    "119": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-118.jpg?alt=media",
                    "120": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-119.jpg?alt=media",
                    "121": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-120.jpg?alt=media",
                    "122": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-121.jpg?alt=media",
                    "123": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-122.jpg?alt=media",
                    "124": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-123.jpg?alt=media",
                    "125": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-124.jpg?alt=media",
                    "126": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-125.jpg?alt=media",
                    "127": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-126.jpg?alt=media",
                    "128": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-127.jpg?alt=media",
                    "129": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-128.jpg?alt=media",
                    "130": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-129.jpg?alt=media",
                    "131": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-130.jpg?alt=media",
                    "132": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-131.jpg?alt=media",
                    "133": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-132.jpg?alt=media",
                    "134": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-133.jpg?alt=media",
                    "135": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-134.jpg?alt=media",
                    "136": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-135.jpg?alt=media",
                    "137": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-136.jpg?alt=media",
                    "138": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/American%20Vampire%20v7%2FAmerican%20Vampire%20v7-137.jpg?alt=media"
                }
            },

            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "36f9c859-3ed5-4405-82c7-0741b2085863",
                "_createdOn": 1743355937321,
                "_id": "36f9c859-3ed5-4405-82c7-0741b2085863",
                "comicContent": {
                    "1": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F001.jpg?alt=media",
                    "2": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F002.jpg?alt=media",
                    "3": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F003.jpg?alt=media",
                    "4": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F004.jpg?alt=media",
                    "5": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F005.jpg?alt=media",
                    "6": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F006.jpg?alt=media",
                    "7": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F007.jpg?alt=media",
                    "8": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F008.jpg?alt=media",
                    "9": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F009.jpg?alt=media",
                    "10": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F010.jpg?alt=media",
                    "11": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F011.jpg?alt=media",
                    "12": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F012.jpg?alt=media",
                    "13": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F013.jpg?alt=media",
                    "14": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F014.jpg?alt=media",
                    "15": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F015.jpg?alt=media",
                    "16": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F016.jpg?alt=media",
                    "17": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F017.jpg?alt=media",
                    "18": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F018.jpg?alt=media",
                    "19": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F019.jpg?alt=media",
                    "20": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F020.jpg?alt=media",
                    "21": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F021.jpg?alt=media",
                    "22": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F022.jpg?alt=media",
                    "23": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F023.jpg?alt=media",
                    "24": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F024.jpg?alt=media",
                    "25": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F025.jpg?alt=media",
                    "26": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F026.jpg?alt=media",
                    "27": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F027.jpg?alt=media",
                    "28": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F028.jpg?alt=media",
                    "29": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F029.jpg?alt=media",
                    "30": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F030.jpg?alt=media",
                    "31": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F031.jpg?alt=media",
                    "32": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F032.jpg?alt=media",
                    "33": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F033.jpg?alt=media",
                    "34": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F034.jpg?alt=media",
                    "35": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F035.jpg?alt=media",
                    "36": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F036.jpg?alt=media",
                    "37": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F037.jpg?alt=media",
                    "38": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F038.jpg?alt=media",
                    "39": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F039.jpg?alt=media",
                    "40": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F040.jpg?alt=media",
                    "41": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F041.jpg?alt=media",
                    "42": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F042.jpg?alt=media",
                    "43": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F043.jpg?alt=media",
                    "44": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F044.jpg?alt=media",
                    "45": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F045.jpg?alt=media",
                    "46": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F046.jpg?alt=media",
                    "47": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F047.jpg?alt=media",
                    "48": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F048.jpg?alt=media",
                    "49": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F049.jpg?alt=media",
                    "50": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F050.jpg?alt=media",
                    "51": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F051.jpg?alt=media",
                    "52": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F052.jpg?alt=media",
                    "53": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F053.jpg?alt=media",
                    "54": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F054.jpg?alt=media",
                    "55": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F055.jpg?alt=media",
                    "56": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F056.jpg?alt=media",
                    "57": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F057.jpg?alt=media",
                    "58": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F058.jpg?alt=media",
                    "59": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F059.jpg?alt=media",
                    "60": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F060.jpg?alt=media",
                    "61": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F061.jpg?alt=media",
                    "62": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F062.jpg?alt=media",
                    "63": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F063.jpg?alt=media",
                    "64": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F064.jpg?alt=media",
                    "65": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F065.jpg?alt=media",
                    "66": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F066.jpg?alt=media",
                    "67": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F067.jpg?alt=media",
                    "68": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F068.jpg?alt=media",
                    "69": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F069.jpg?alt=media",
                    "70": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F070.jpg?alt=media",
                    "71": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F071.jpg?alt=media",
                    "72": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F072.jpg?alt=media",
                    "73": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F073.jpg?alt=media",
                    "74": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F074.jpg?alt=media",
                    "75": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F075.jpg?alt=media",
                    "76": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F076.jpg?alt=media",
                    "77": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F077.jpg?alt=media",
                    "78": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F078.jpg?alt=media",
                    "79": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F079.jpg?alt=media",
                    "80": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F080.jpg?alt=media",
                    "81": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F081.jpg?alt=media",
                    "82": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F082.jpg?alt=media",
                    "83": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F083.jpg?alt=media",
                    "84": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F084.jpg?alt=media",
                    "85": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F085.jpg?alt=media",
                    "86": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F086.jpg?alt=media",
                    "87": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F087.jpg?alt=media",
                    "88": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F088.jpg?alt=media",
                    "89": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F089.jpg?alt=media",
                    "90": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F090.jpg?alt=media",
                    "91": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F091.jpg?alt=media",
                    "92": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F092.jpg?alt=media",
                    "93": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F093.jpg?alt=media",
                    "94": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F094.jpg?alt=media",
                    "95": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F095.jpg?alt=media",
                    "96": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F096.jpg?alt=media",
                    "97": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F097.jpg?alt=media",
                    "98": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F098.jpg?alt=media",
                    "99": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F099.jpg?alt=media",
                    "100": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F100.jpg?alt=media",
                    "101": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F101.jpg?alt=media",
                    "102": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F102.jpg?alt=media",
                    "103": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F103.jpg?alt=media",
                    "104": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F104.jpg?alt=media",
                    "105": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Birthright%20v08%20-%20Live%20By%20The%20Sword%2F105.jpg?alt=media"
                }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "71bfcd5b-b962-4229-8e6f-de2e427fe69d",
                "_createdOn": 1743355937321,
                "_id": "71bfcd5b-b962-4229-8e6f-de2e427fe69d",
  "comicContent": {
    "1": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-000.jpg?alt=media",
    "2": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-001.jpg?alt=media",
    "3": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-002.jpg?alt=media",
    "4": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-003.jpg?alt=media",
    "5": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-004.jpg?alt=media",
    "6": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-005.jpg?alt=media",
    "7": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-006.jpg?alt=media",
    "8": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-007.jpg?alt=media",
    "9": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-008.jpg?alt=media",
    "10": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-009.jpg?alt=media",
    "11": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-010.jpg?alt=media",
    "12": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-011.jpg?alt=media",
    "13": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-012.jpg?alt=media",
    "14": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-013.jpg?alt=media",
    "15": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-014.jpg?alt=media",
    "16": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-015.jpg?alt=media",
    "17": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-016.jpg?alt=media",
    "18": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-017.jpg?alt=media",
    "19": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-018.jpg?alt=media",
    "20": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-019.jpg?alt=media",
    "21": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-020.jpg?alt=media",
    "22": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-021.jpg?alt=media",
    "23": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-022.jpg?alt=media",
    "24": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-023.jpg?alt=media",
    "25": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-024.jpg?alt=media",
    "26": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-025.jpg?alt=media",
    "27": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-026.jpg?alt=media",
    "28": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-027.jpg?alt=media",
    "29": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-028.jpg?alt=media",
    "30": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-029.jpg?alt=media",
    "31": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-030.jpg?alt=media",
    "32": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-031.jpg?alt=media",
    "33": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-032.jpg?alt=media",
    "34": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-033.jpg?alt=media",
    "35": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-034.jpg?alt=media",
    "36": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-035.jpg?alt=media",
    "37": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-036.jpg?alt=media",
    "38": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-037.jpg?alt=media",
    "39": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-038.jpg?alt=media",
    "40": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-039.jpg?alt=media",
    "41": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-040.jpg?alt=media",
    "42": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-041.jpg?alt=media",
    "43": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-042.jpg?alt=media",
    "44": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-043.jpg?alt=media",
    "45": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-044.jpg?alt=media",
    "46": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-045.jpg?alt=media",
    "47": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-046.jpg?alt=media",
    "48": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-047.jpg?alt=media",
    "49": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-048.jpg?alt=media",
    "50": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-049.jpg?alt=media",
    "51": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-050.jpg?alt=media",
    "52": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-051.jpg?alt=media",
    "53": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-052.jpg?alt=media",
    "54": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-053.jpg?alt=media",
    "55": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-054.jpg?alt=media",
    "56": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-055.jpg?alt=media",
    "57": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-056.jpg?alt=media",
    "58": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-057.jpg?alt=media",
    "59": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-058.jpg?alt=media",
    "60": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-059.jpg?alt=media",
    "61": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-060.jpg?alt=media",
    "62": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-061.jpg?alt=media",
    "63": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-062.jpg?alt=media",
    "64": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-063.jpg?alt=media",
    "65": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-064.jpg?alt=media",
    "66": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-065.jpg?alt=media",
    "67": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-066.jpg?alt=media",
    "68": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-067.jpg?alt=media",
    "69": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-068.jpg?alt=media",
    "70": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-069.jpg?alt=media",
    "71": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-070.jpg?alt=media",
    "72": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-071.jpg?alt=media",
    "73": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-072.jpg?alt=media",
    "74": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-073.jpg?alt=media",
    "75": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-074.jpg?alt=media",
    "76": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-075.jpg?alt=media",
    "77": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-076.jpg?alt=media",
    "78": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-077.jpg?alt=media",
    "79": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-078.jpg?alt=media",
    "80": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-079.jpg?alt=media",
    "81": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-080.jpg?alt=media",
    "82": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-081.jpg?alt=media",
    "83": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-082.jpg?alt=media",
    "84": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-083.jpg?alt=media",
    "85": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-084.jpg?alt=media",
    "86": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-085.jpg?alt=media",
    "87": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-086.jpg?alt=media",
    "88": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-087.jpg?alt=media",
    "89": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-088.jpg?alt=media",
    "90": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-089.jpg?alt=media",
    "91": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-090.jpg?alt=media",
    "92": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-091.jpg?alt=media",
    "93": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-092.jpg?alt=media",
    "94": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-093.jpg?alt=media",
    "95": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-094.jpg?alt=media",
    "96": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-095.jpg?alt=media",
    "97": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-096.jpg?alt=media",
    "98": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-097.jpg?alt=media",
    "99": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Predator%20-%20Prey%20to%20the%20Heavens%2FPredator%20-%20Prey%20to%20the%20Heavens-098.jpg?alt=media"
  }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "71bfcd5b-b962-4229-8e6f-de2e427th69d",
                "_createdOn": 1743355937321,
                "_id": "71bfcd5b-b962-4229-8e6f-de2e427th69d",
  "comicContent": {
    "1": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-000.jpg?alt=media",
    "2": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-001.jpg?alt=media",
    "3": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-002.jpg?alt=media",
    "4": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-003.jpg?alt=media",
    "5": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-004.jpg?alt=media",
    "6": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-005.jpg?alt=media",
    "7": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-006.jpg?alt=media",
    "8": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-007.jpg?alt=media",
    "9": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-008.jpg?alt=media",
    "10": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-009.jpg?alt=media",
    "11": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-010.jpg?alt=media",
    "12": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-011.jpg?alt=media",
    "13": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-012.jpg?alt=media",
    "14": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-013.jpg?alt=media",
    "15": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-014.jpg?alt=media",
    "16": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-015.jpg?alt=media",
    "17": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-016.jpg?alt=media",
    "18": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-017.jpg?alt=media",
    "19": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-018.jpg?alt=media",
    "20": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-019.jpg?alt=media",
    "21": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-020.jpg?alt=media",
    "22": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-021.jpg?alt=media",
    "23": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-022.jpg?alt=media",
    "24": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-023.jpg?alt=media",
    "25": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-024.jpg?alt=media",
    "26": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-025.jpg?alt=media",
    "27": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-026.jpg?alt=media",
    "28": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-027.jpg?alt=media",
    "29": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-028.jpg?alt=media",
    "30": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-029.jpg?alt=media",
    "31": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-030.jpg?alt=media",
    "32": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-031.jpg?alt=media",
    "33": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-032.jpg?alt=media",
    "34": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-033.jpg?alt=media",
    "35": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-034.jpg?alt=media",
    "36": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-035.jpg?alt=media",
    "37": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-036.jpg?alt=media",
    "38": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-037.jpg?alt=media",
    "39": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-038.jpg?alt=media",
    "40": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-039.jpg?alt=media",
    "41": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-040.jpg?alt=media",
    "42": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-041.jpg?alt=media",
    "43": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-042.jpg?alt=media",
    "44": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-043.jpg?alt=media",
    "45": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-044.jpg?alt=media",
    "46": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-045.jpg?alt=media",
    "47": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-046.jpg?alt=media",
    "48": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-047.jpg?alt=media",
    "49": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-048.jpg?alt=media",
    "50": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-049.jpg?alt=media",
    "51": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-050.jpg?alt=media",
    "52": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-051.jpg?alt=media",
    "53": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-052.jpg?alt=media",
    "54": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-053.jpg?alt=media",
    "55": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-054.jpg?alt=media",
    "56": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-055.jpg?alt=media",
    "57": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-056.jpg?alt=media",
    "58": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-057.jpg?alt=media",
    "59": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-058.jpg?alt=media",
    "60": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-059.jpg?alt=media",
    "61": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-060.jpg?alt=media",
    "62": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-061.jpg?alt=media",
    "63": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-062.jpg?alt=media",
    "64": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-063.jpg?alt=media",
    "65": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-064.jpg?alt=media",
    "66": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-065.jpg?alt=media",
    "67": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-066.jpg?alt=media",
    "68": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-067.jpg?alt=media",
    "69": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-068.jpg?alt=media",
    "70": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-069.jpg?alt=media",
    "71": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-070.jpg?alt=media",
    "72": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-071.jpg?alt=media",
    "73": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-072.jpg?alt=media",
    "74": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-073.jpg?alt=media",
    "75": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-074.jpg?alt=media",
    "76": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-075.jpg?alt=media",
    "77": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-076.jpg?alt=media",
    "78": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-077.jpg?alt=media",
    "79": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-078.jpg?alt=media",
    "80": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-079.jpg?alt=media",
    "81": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-080.jpg?alt=media",
    "82": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-081.jpg?alt=media",
    "83": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-082.jpg?alt=media",
    "84": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-083.jpg?alt=media",
    "85": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-084.jpg?alt=media",
    "86": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-085.jpg?alt=media",
    "87": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-086.jpg?alt=media",
    "88": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-087.jpg?alt=media",
    "89": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-088.jpg?alt=media",
    "90": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-089.jpg?alt=media",
    "91": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-090.jpg?alt=media",
    "92": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-091.jpg?alt=media",
    "93": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-092.jpg?alt=media",
    "94": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-093.jpg?alt=media",
    "95": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-094.jpg?alt=media",
    "96": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-095.jpg?alt=media",
    "97": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-096.jpg?alt=media",
    "98": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-097.jpg?alt=media",
    "99": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-098.jpg?alt=media",
    "100": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-099.jpg?alt=media",
    "101": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-100.jpg?alt=media",
    "102": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-101.jpg?alt=media",
    "103": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-102.jpg?alt=media",
    "104": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-103.jpg?alt=media",
    "105": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-104.jpg?alt=media",
    "106": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-105.jpg?alt=media",
    "107": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-106.jpg?alt=media",
    "108": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-107.jpg?alt=media",
    "109": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-108.jpg?alt=media",
    "110": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-109.jpg?alt=media",
    "111": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-110.jpg?alt=media",
    "112": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-111.jpg?alt=media",
    "113": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-112.jpg?alt=media",
    "114": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-113.jpg?alt=media",
    "115": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-114.jpg?alt=media",
    "116": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-115.jpg?alt=media",
    "117": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-116.jpg?alt=media",
    "118": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-117.jpg?alt=media",
    "119": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-118.jpg?alt=media",
    "120": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-119.jpg?alt=media",
    "121": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-120.jpg?alt=media",
    "122": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-121.jpg?alt=media",
    "123": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-122.jpg?alt=media",
    "124": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-123.jpg?alt=media",
    "125": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-124.jpg?alt=media",
    "126": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-125.jpg?alt=media",
    "127": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-126.jpg?alt=media",
    "128": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-127.jpg?alt=media",
    "129": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-128.jpg?alt=media",
    "130": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-129.jpg?alt=media",
    "131": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-130.jpg?alt=media",
    "132": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-131.jpg?alt=media",
    "133": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-132.jpg?alt=media",
    "134": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-133.jpg?alt=media",
    "135": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-134.jpg?alt=media",
    "136": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-135.jpg?alt=media",
    "137": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-136.jpg?alt=media",
    "138": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-137.jpg?alt=media",
    "139": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-138.jpg?alt=media",
    "140": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-139.jpg?alt=media",
    "141": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-140.jpg?alt=media",
    "142": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-141.jpg?alt=media",
    "143": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-142.jpg?alt=media",
    "144": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-143.jpg?alt=media",
    "145": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-144.jpg?alt=media",
    "146": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-145.jpg?alt=media",
    "147": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-146.jpg?alt=media",
    "148": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-147.jpg?alt=media",
    "149": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-148.jpg?alt=media",
    "150": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-149.jpg?alt=media",
    "151": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-150.jpg?alt=media",
    "152": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-151.jpg?alt=media",
    "153": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-152.jpg?alt=media",
    "154": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-153.jpg?alt=media",
    "155": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-154.jpg?alt=media",
    "156": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-155.jpg?alt=media",
    "157": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-156.jpg?alt=media",
    "158": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-157.jpg?alt=media",
    "159": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-158.jpg?alt=media",
    "160": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-159.jpg?alt=media",
    "161": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-160.jpg?alt=media",
    "162": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-161.jpg?alt=media",
    "163": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-162.jpg?alt=media",
    "164": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-163.jpg?alt=media",
    "165": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-164.jpg?alt=media",
    "166": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-165.jpg?alt=media",
    "167": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-166.jpg?alt=media",
    "168": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-167.jpg?alt=media",
    "169": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-168.jpg?alt=media",
    "170": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-169.jpg?alt=media",
    "171": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-170.jpg?alt=media",
    "172": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-171.jpg?alt=media",
    "173": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-172.jpg?alt=media",
    "174": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-173.jpg?alt=media",
    "175": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-174.jpg?alt=media",
    "176": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-175.jpg?alt=media",
    "177": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-176.jpg?alt=media",
    "178": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-177.jpg?alt=media",
    "179": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-178.jpg?alt=media",
    "180": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-179.jpg?alt=media",
    "181": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-180.jpg?alt=media",
    "182": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-181.jpg?alt=media",
    "183": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-182.jpg?alt=media",
    "184": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-183.jpg?alt=media",
    "185": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-184.jpg?alt=media",
    "186": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-185.jpg?alt=media",
    "187": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-186.jpg?alt=media",
    "188": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-187.jpg?alt=media",
    "189": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-188.jpg?alt=media",
    "190": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-189.jpg?alt=media",
    "191": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-190.jpg?alt=media",
    "192": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-191.jpg?alt=media",
    "193": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-192.jpg?alt=media",
    "194": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-193.jpg?alt=media",
    "195": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-194.jpg?alt=media",
    "196": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-195.jpg?alt=media",
    "197": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-196.jpg?alt=media",
    "198": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-197.jpg?alt=media",
    "199": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-198.jpg?alt=media",
    "200": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-199.jpg?alt=media",
    "201": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-200.jpg?alt=media",
    "202": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-201.jpg?alt=media",
    "203": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-202.jpg?alt=media",
    "204": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-203.jpg?alt=media",
    "205": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-204.jpg?alt=media",
    "206": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-205.jpg?alt=media",
    "207": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-206.jpg?alt=media",
    "208": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-207.jpg?alt=media",
    "209": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-208.jpg?alt=media",
    "210": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-209.jpg?alt=media",
    "211": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Half%20Past%20Danger%2FHalf%20Past%20Danger-210.jpg?alt=media"
  }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "d239fb5b-f90a-4862-9162-f9e9f6757683",
                "_createdOn": 1743355937321,
                "_id": "d239fb5b-f90a-4862-9162-f9e9f6757683",
  "comicContent": {
    "1": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0000.jpg?alt=media",
    "2": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0001.jpg?alt=media",
    "3": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0002.jpg?alt=media",
    "4": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0003.jpg?alt=media",
    "5": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0004.jpg?alt=media",
    "6": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0005.jpg?alt=media",
    "7": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0006.jpg?alt=media",
    "8": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0007.jpg?alt=media",
    "9": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0008.jpg?alt=media",
    "10": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0009.jpg?alt=media",
    "11": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0010.jpg?alt=media",
    "12": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0011.jpg?alt=media",
    "13": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0012.jpg?alt=media",
    "14": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0013.jpg?alt=media",
    "15": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0014.jpg?alt=media",
    "16": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0015.jpg?alt=media",
    "17": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0016.jpg?alt=media",
    "18": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0017.jpg?alt=media",
    "19": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0018.jpg?alt=media",
    "20": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0019.jpg?alt=media",
    "21": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0020.jpg?alt=media",
    "22": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0021.jpg?alt=media",
    "23": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0022.jpg?alt=media",
    "24": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0023.jpg?alt=media",
    "25": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0024.jpg?alt=media",
    "26": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0025.jpg?alt=media",
    "27": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0026.jpg?alt=media",
    "28": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0027.jpg?alt=media",
    "29": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0028.jpg?alt=media",
    "30": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0029.jpg?alt=media",
    "31": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0030.jpg?alt=media",
    "32": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0031.jpg?alt=media",
    "33": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0032.jpg?alt=media",
    "34": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0033.jpg?alt=media",
    "35": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0034.jpg?alt=media",
    "36": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0035.jpg?alt=media",
    "37": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0036.jpg?alt=media",
    "38": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0037.jpg?alt=media",
    "39": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0038.jpg?alt=media",
    "40": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0039.jpg?alt=media",
    "41": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0040.jpg?alt=media",
    "42": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0041.jpg?alt=media",
    "43": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0042.jpg?alt=media",
    "44": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0043.jpg?alt=media",
    "45": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0044.jpg?alt=media",
    "46": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0045.jpg?alt=media",
    "47": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0046.jpg?alt=media",
    "48": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0047.jpg?alt=media",
    "49": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0048.jpg?alt=media",
    "50": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0049.jpg?alt=media",
    "51": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0050.jpg?alt=media",
    "52": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0051.jpg?alt=media",
    "53": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0052.jpg?alt=media",
    "54": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0053.jpg?alt=media",
    "55": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0054.jpg?alt=media",
    "56": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0055.jpg?alt=media",
    "57": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0056.jpg?alt=media",
    "58": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0057.jpg?alt=media",
    "59": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0058.jpg?alt=media",
    "60": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0059.jpg?alt=media",
    "61": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0060.jpg?alt=media",
    "62": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0061.jpg?alt=media",
    "63": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0062.jpg?alt=media",
    "64": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0063.jpg?alt=media",
    "65": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0064.jpg?alt=media",
    "66": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0065.jpg?alt=media",
    "67": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0066.jpg?alt=media",
    "68": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0067.jpg?alt=media",
    "69": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0068.jpg?alt=media",
    "70": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Assassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory%2FAssassin's%20Creed%20Valhalla%20-%20Song%20of%20Glory-0069.jpg?alt=media"
  }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "71bfcd5b-b962-4229-8e6f-de2s727fe69d",
                "_createdOn": 1743355937321,
                "_id": "71bfcd5b-b962-4229-8e6f-de2s727fe69d",
  "comicContent": {
    "1": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-000.jpg?alt=media",
    "2": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-001.jpg?alt=media",
    "3": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-002.jpg?alt=media",
    "4": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-003.jpg?alt=media",
    "5": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-004.jpg?alt=media",
    "6": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-005.jpg?alt=media",
    "7": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-006.jpg?alt=media",
    "8": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-007.jpg?alt=media",
    "9": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-008.jpg?alt=media",
    "10": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-009.jpg?alt=media",
    "11": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-010.jpg?alt=media",
    "12": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-011.jpg?alt=media",
    "13": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-012.jpg?alt=media",
    "14": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-013.jpg?alt=media",
    "15": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-014.jpg?alt=media",
    "16": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-015.jpg?alt=media",
    "17": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-016.jpg?alt=media",
    "18": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-017.jpg?alt=media",
    "19": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-018.jpg?alt=media",
    "20": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-019.jpg?alt=media",
    "21": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-020.jpg?alt=media",
    "22": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-021.jpg?alt=media",
    "23": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-022.jpg?alt=media",
    "24": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-023.jpg?alt=media",
    "25": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-024.jpg?alt=media",
    "26": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-025.jpg?alt=media",
    "27": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-026.jpg?alt=media",
    "28": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-027.jpg?alt=media",
    "29": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-028.jpg?alt=media",
    "30": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-029.jpg?alt=media",
    "31": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-030.jpg?alt=media",
    "32": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-031.jpg?alt=media",
    "33": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-032.jpg?alt=media",
    "34": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-033.jpg?alt=media",
    "35": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-034.jpg?alt=media",
    "36": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-035.jpg?alt=media",
    "37": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-036.jpg?alt=media",
    "38": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-037.jpg?alt=media",
    "39": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-038.jpg?alt=media",
    "40": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-039.jpg?alt=media",
    "41": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-040.jpg?alt=media",
    "42": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-041.jpg?alt=media",
    "43": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-042.jpg?alt=media",
    "44": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-043.jpg?alt=media",
    "45": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Promethee%2001%20-%20Atlantis%2FPromethee%20-%20Atlantis%20v1-044.jpg?alt=media"
  }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "71bfcd5b-b962-4229-8e6f-de2s687fe69d",
                "_createdOn": 1743355937321,
                "_id": "71bfcd5b-b962-4229-8e6f-de2s687fe69d",
  "comicContent": {
    "1": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-000.jpg?alt=media",
    "2": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-001.jpg?alt=media",
    "3": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-002.jpg?alt=media",
    "4": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-003.jpg?alt=media",
    "5": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-004.jpg?alt=media",
    "6": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-005.jpg?alt=media",
    "7": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-006.jpg?alt=media",
    "8": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-007.jpg?alt=media",
    "9": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-008.jpg?alt=media",
    "10": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-009.jpg?alt=media",
    "11": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-010.jpg?alt=media",
    "12": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-011.jpg?alt=media",
    "13": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-012.jpg?alt=media",
    "14": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-013.jpg?alt=media",
    "15": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-014.jpg?alt=media",
    "16": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-015.jpg?alt=media",
    "17": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-016.jpg?alt=media",
    "18": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-017.jpg?alt=media",
    "19": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-018.jpg?alt=media",
    "20": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-019.jpg?alt=media",
    "21": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-020.jpg?alt=media",
    "22": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-021.jpg?alt=media",
    "23": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-022.jpg?alt=media",
    "24": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-023.jpg?alt=media",
    "25": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-024.jpg?alt=media",
    "26": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-025.jpg?alt=media",
    "27": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-026.jpg?alt=media",
    "28": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-027.jpg?alt=media",
    "29": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-028.jpg?alt=media",
    "30": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-029.jpg?alt=media",
    "31": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-030.jpg?alt=media",
    "32": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-031.jpg?alt=media",
    "33": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-032.jpg?alt=media",
    "34": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-033.jpg?alt=media",
    "35": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-034.jpg?alt=media",
    "36": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-035.jpg?alt=media",
    "37": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-036.jpg?alt=media",
    "38": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-037.jpg?alt=media",
    "39": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-038.jpg?alt=media",
    "40": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-039.jpg?alt=media",
    "41": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-040.jpg?alt=media",
    "42": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-041.jpg?alt=media",
    "43": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-042.jpg?alt=media",
    "44": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-043.jpg?alt=media",
    "45": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-044.jpg?alt=media",
    "46": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-045.jpg?alt=media",
    "47": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-046.jpg?alt=media",
    "48": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/War%20of%20the%20World%20War%20One%20v01%20-%20The%20Thing%20Below%20the%20Trenches%2FWar%20of%20the%20World%20War%20One%20-%20The%20Thing%20Below%20the%20Trenches%20v1-047.jpg?alt=media"
  }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b653-3d422c519f33",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b653-3d422c519f33",
  "comicContent": {
    "1": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-000-(2020)-(Digital)-(Mephisto-Empire)-000.jpg?alt=media",
    "2": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-000-(2020)-(Digital)-(Mephisto-Empire)-001.jpg?alt=media",
    "3": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-000-(2020)-(Digital)-(Mephisto-Empire)-002.jpg?alt=media",
    "4": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-000-(2020)-(Digital)-(Mephisto-Empire)-003.jpg?alt=media",
    "5": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-001.jpg?alt=media",
    "6": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-002.jpg?alt=media",
    "7": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-003.jpg?alt=media",
    "8": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-004.jpg?alt=media",
    "9": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-005.jpg?alt=media",
    "10": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-006.jpg?alt=media",
    "11": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-007.jpg?alt=media",
    "12": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-008.jpg?alt=media",
    "13": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-009.jpg?alt=media",
    "14": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-010.jpg?alt=media",
    "15": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-011.jpg?alt=media",
    "16": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-012.jpg?alt=media",
    "17": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-013.jpg?alt=media",
    "18": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-014.jpg?alt=media",
    "19": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-015.jpg?alt=media",
    "20": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-016.jpg?alt=media",
    "21": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-017.jpg?alt=media",
    "22": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-018.jpg?alt=media",
    "23": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-019.jpg?alt=media",
    "24": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-020.jpg?alt=media",
    "25": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-021.jpg?alt=media",
    "26": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-022.jpg?alt=media",
    "27": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-023.jpg?alt=media",
    "28": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-009-(2020)-(Digital)-(Mephisto-Empire)-024.jpg?alt=media",
    "29": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-001.jpg?alt=media",
    "30": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-002.jpg?alt=media",
    "31": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-003.jpg?alt=media",
    "32": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-004.jpg?alt=media",
    "33": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-005.jpg?alt=media",
    "34": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-006.jpg?alt=media",
    "35": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-007.jpg?alt=media",
    "36": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-008.jpg?alt=media",
    "37": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-009.jpg?alt=media",
    "38": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-011.jpg?alt=media",
    "39": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-012.jpg?alt=media",
    "40": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-013.jpg?alt=media",
    "41": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-014.jpg?alt=media",
    "42": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-015.jpg?alt=media",
    "43": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-016.jpg?alt=media",
    "44": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-017.jpg?alt=media",
    "45": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-018.jpg?alt=media",
    "46": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-019.jpg?alt=media",
    "47": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-020.jpg?alt=media",
    "48": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-021.jpg?alt=media",
    "49": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-022.jpg?alt=media",
    "50": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-010-(2020)-(Digital)-(Mephisto-Empire)-023.jpg?alt=media",
    "51": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-001.jpg?alt=media",
    "52": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-002.jpg?alt=media",
    "53": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-003.jpg?alt=media",
    "54": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-005.jpg?alt=media",
    "55": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-006.jpg?alt=media",
    "56": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-007.jpg?alt=media",
    "57": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-008.jpg?alt=media",
    "58": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-009.jpg?alt=media",
    "59": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-010.jpg?alt=media",
    "60": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-011.jpg?alt=media",
    "61": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-012.jpg?alt=media",
    "62": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-013.jpg?alt=media",
    "63": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-014.jpg?alt=media",
    "64": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-015.jpg?alt=media",
    "65": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-016.jpg?alt=media",
    "66": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-017.jpg?alt=media",
    "67": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-018.jpg?alt=media",
    "68": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-019.jpg?alt=media",
    "69": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-020.jpg?alt=media",
    "70": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-021.jpg?alt=media",
    "71": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-022.jpg?alt=media",
    "72": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-011-(2020)-(Digital)-(Mephisto-Empire)-023.jpg?alt=media",
    "73": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-001.jpg?alt=media",
    "74": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-002.jpg?alt=media",
    "75": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-003.jpg?alt=media",
    "76": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-004.jpg?alt=media",
    "77": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-005.jpg?alt=media",
    "78": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-006.jpg?alt=media",
    "79": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-007.jpg?alt=media",
    "80": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-008.jpg?alt=media",
    "81": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-009.jpg?alt=media",
    "82": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-010.jpg?alt=media",
    "83": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-011.jpg?alt=media",
    "84": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-012.jpg?alt=media",
    "85": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-013.jpg?alt=media",
    "86": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-014.jpg?alt=media",
    "87": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-015.jpg?alt=media",
    "88": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-016.jpg?alt=media",
    "89": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-017.jpg?alt=media",
    "90": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-018.jpg?alt=media",
    "91": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-019.jpg?alt=media",
    "92": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-020.jpg?alt=media",
    "93": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-021.jpg?alt=media",
    "94": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-012-(2021)-(Digital)-(Mephisto-Empire)-022.jpg?alt=media",
    "95": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-000.jpg?alt=media",
    "96": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-001.jpg?alt=media",
    "97": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-002.jpg?alt=media",
    "98": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-003.jpg?alt=media",
    "99": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-004.jpg?alt=media",
    "100": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-005.jpg?alt=media",
    "101": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-006.jpg?alt=media",
    "102": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-007.jpg?alt=media",
    "103": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-008.jpg?alt=media",
    "104": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-009.jpg?alt=media",
    "105": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-010.jpg?alt=media",
    "106": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-011.jpg?alt=media",
    "107": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-012.jpg?alt=media",
    "108": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-013.jpg?alt=media",
    "109": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-014.jpg?alt=media",
    "110": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/The%20Red%20Mother%20v03%2FRed-Mother-999-015.jpg?alt=media"
  }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b653-3d456h719f33",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b653-3d456h719f33",
  "comicContent": {
    "1": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-000.jpg?alt=media",
    "2": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-001.jpg?alt=media",
    "3": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-002.jpg?alt=media",
    "4": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-003.jpg?alt=media",
    "5": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-004.jpg?alt=media",
    "6": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-005.jpg?alt=media",
    "7": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-006.jpg?alt=media",
    "8": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-007.jpg?alt=media",
    "9": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-008.jpg?alt=media",
    "10": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-009.jpg?alt=media",
    "11": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-010.jpg?alt=media",
    "12": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-011.jpg?alt=media",
    "13": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-012.jpg?alt=media",
    "14": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-013.jpg?alt=media",
    "15": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-014.jpg?alt=media",
    "16": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-015.jpg?alt=media",
    "17": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-016.jpg?alt=media",
    "18": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-017.jpg?alt=media",
    "19": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-018.jpg?alt=media",
    "20": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-019.jpg?alt=media",
    "21": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-020.jpg?alt=media",
    "22": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-021.jpg?alt=media",
    "23": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-022.jpg?alt=media",
    "24": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-023.jpg?alt=media",
    "25": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-024.jpg?alt=media",
    "26": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-025.jpg?alt=media",
    "27": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-026.jpg?alt=media",
    "28": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-027.jpg?alt=media",
    "29": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-028.jpg?alt=media",
    "30": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-029.jpg?alt=media",
    "31": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-030.jpg?alt=media",
    "32": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-031.jpg?alt=media",
    "33": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-032.jpg?alt=media",
    "34": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-033.jpg?alt=media",
    "35": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-034.jpg?alt=media",
    "36": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-035.jpg?alt=media",
    "37": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-036.jpg?alt=media",
    "38": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-037.jpg?alt=media",
    "39": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-038.jpg?alt=media",
    "40": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-039.jpg?alt=media",
    "41": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-040.jpg?alt=media",
    "42": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-041.jpg?alt=media",
    "43": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-042.jpg?alt=media",
    "44": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-043.jpg?alt=media",
    "45": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-044.jpg?alt=media",
    "46": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-045.jpg?alt=media",
    "47": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-046.jpg?alt=media",
    "48": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-047.jpg?alt=media",
    "49": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-048.jpg?alt=media",
    "50": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-049.jpg?alt=media",
    "51": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-050.jpg?alt=media",
    "52": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-051.jpg?alt=media",
    "53": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-052.jpg?alt=media",
    "54": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-053.jpg?alt=media",
    "55": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-054.jpg?alt=media",
    "56": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-055.jpg?alt=media",
    "57": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-056.jpg?alt=media",
    "58": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-057.jpg?alt=media",
    "59": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-058.jpg?alt=media",
    "60": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-059.jpg?alt=media",
    "61": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-060.jpg?alt=media",
    "62": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-061.jpg?alt=media",
    "63": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-062.jpg?alt=media",
    "64": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-063.jpg?alt=media",
    "65": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-064.jpg?alt=media",
    "66": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-065.jpg?alt=media",
    "67": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-066.jpg?alt=media",
    "68": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-067.jpg?alt=media",
    "69": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-068.jpg?alt=media",
    "70": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-069.jpg?alt=media",
    "71": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-070.jpg?alt=media",
    "72": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-071.jpg?alt=media",
    "73": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-072.jpg?alt=media",
    "74": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-073.jpg?alt=media",
    "75": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-074.jpg?alt=media",
    "76": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-075.jpg?alt=media",
    "77": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-076.jpg?alt=media",
    "78": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-077.jpg?alt=media",
    "79": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-078.jpg?alt=media",
    "80": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-079.jpg?alt=media",
    "81": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-080.jpg?alt=media",
    "82": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-081.jpg?alt=media",
    "83": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-082.jpg?alt=media",
    "84": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-083.jpg?alt=media",
    "85": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-084.jpg?alt=media",
    "86": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-085.jpg?alt=media",
    "87": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-086.jpg?alt=media",
    "88": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-087.jpg?alt=media",
    "89": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-088.jpg?alt=media",
    "90": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-089.jpg?alt=media",
    "91": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-090.jpg?alt=media",
    "92": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-091.jpg?alt=media",
    "93": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-092.jpg?alt=media",
    "94": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-093.jpg?alt=media",
    "95": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-094.jpg?alt=media",
    "96": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-095.jpg?alt=media",
    "97": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-096.jpg?alt=media",
    "98": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-097.jpg?alt=media",
    "99": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-098.jpg?alt=media",
    "100": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-099.jpg?alt=media",
    "101": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-100.jpg?alt=media",
    "102": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-101.jpg?alt=media",
    "103": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-102.jpg?alt=media",
    "104": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-103.jpg?alt=media",
    "105": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-104.jpg?alt=media",
    "106": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-105.jpg?alt=media",
    "107": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-106.jpg?alt=media",
    "108": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-107-108.jpg?alt=media",
    "109": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-109.jpg?alt=media",
    "110": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-110.jpg?alt=media",
    "111": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-111.jpg?alt=media",
    "112": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-112.jpg?alt=media",
    "113": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Venus%2FVenus-113.jpg?alt=media"
  }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "02901320-de01-4ab5-a7ac-f6b2bd71f5c0",
                "_createdOn": 1743355937321,
                "_id": "02901320-de01-4ab5-a7ac-f6b2bd71f5c0",
  "comicContent": {
    "1": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-000.jpg?alt=media",
    "2": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-001.jpg?alt=media",
    "3": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-002.jpg?alt=media",
    "4": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-003.jpg?alt=media",
    "5": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-004.jpg?alt=media",
    "6": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-005.jpg?alt=media",
    "7": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-006.jpg?alt=media",
    "8": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-007.jpg?alt=media",
    "9": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-008.jpg?alt=media",
    "10": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-009.jpg?alt=media",
    "11": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-010.jpg?alt=media",
    "12": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-011.jpg?alt=media",
    "13": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-012.jpg?alt=media",
    "14": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-013.jpg?alt=media",
    "15": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-014.jpg?alt=media",
    "16": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-015.jpg?alt=media",
    "17": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-016.jpg?alt=media",
    "18": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-017.jpg?alt=media",
    "19": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-018.jpg?alt=media",
    "20": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-019.jpg?alt=media",
    "21": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-020.jpg?alt=media",
    "22": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-021.jpg?alt=media",
    "23": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-022.jpg?alt=media",
    "24": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-023.jpg?alt=media",
    "25": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-024.jpg?alt=media",
    "26": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-025.jpg?alt=media",
    "27": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-026.jpg?alt=media",
    "28": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-027.jpg?alt=media",
    "29": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-028.jpg?alt=media",
    "30": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-029.jpg?alt=media",
    "31": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-030.jpg?alt=media",
    "32": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-031.jpg?alt=media",
    "33": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-032.jpg?alt=media",
    "34": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-033.jpg?alt=media",
    "35": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-034.jpg?alt=media",
    "36": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-035.jpg?alt=media",
    "37": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-036.jpg?alt=media",
    "38": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-037.jpg?alt=media",
    "39": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-038.jpg?alt=media",
    "40": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-039.jpg?alt=media",
    "41": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-040.jpg?alt=media",
    "42": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-041.jpg?alt=media",
    "43": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-042.jpg?alt=media",
    "44": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-043.jpg?alt=media",
    "45": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-044.jpg?alt=media",
    "46": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-045.jpg?alt=media",
    "47": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-046.jpg?alt=media",
    "48": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-047.jpg?alt=media",
    "49": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-048.jpg?alt=media",
    "50": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-049.jpg?alt=media",
    "51": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-050.jpg?alt=media",
    "52": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-051.jpg?alt=media",
    "53": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-052.jpg?alt=media",
    "54": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-053.jpg?alt=media",
    "55": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-054.jpg?alt=media",
    "56": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-055.jpg?alt=media",
    "57": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-056.jpg?alt=media",
    "58": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-057.jpg?alt=media",
    "59": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-058.jpg?alt=media",
    "60": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-059.jpg?alt=media",
    "61": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-060.jpg?alt=media",
    "62": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-061.jpg?alt=media",
    "63": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-062.jpg?alt=media",
    "64": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-063.jpg?alt=media",
    "65": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-064.jpg?alt=media",
    "66": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-065.jpg?alt=media",
    "67": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-066.jpg?alt=media",
    "68": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-067.jpg?alt=media",
    "69": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-068.jpg?alt=media",
    "70": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-069.jpg?alt=media",
    "71": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-070.jpg?alt=media",
    "72": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-071.jpg?alt=media",
    "73": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-072.jpg?alt=media",
    "74": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-073.jpg?alt=media",
    "75": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-074.jpg?alt=media",
    "76": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-075.jpg?alt=media",
    "77": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-076.jpg?alt=media",
    "78": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-077.jpg?alt=media",
    "79": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-078.jpg?alt=media",
    "80": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-079.jpg?alt=media",
    "81": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-080.jpg?alt=media",
    "82": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-081.jpg?alt=media",
    "83": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-082.jpg?alt=media",
    "84": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-083.jpg?alt=media",
    "85": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-084.jpg?alt=media",
    "86": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-085.jpg?alt=media",
    "87": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-086.jpg?alt=media",
    "88": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-087.jpg?alt=media",
    "89": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-088.jpg?alt=media",
    "90": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-089.jpg?alt=media",
    "91": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-090.jpg?alt=media",
    "92": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-091.jpg?alt=media",
    "93": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-092.jpg?alt=media",
    "94": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-093.jpg?alt=media",
    "95": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-094.jpg?alt=media",
    "96": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-095.jpg?alt=media",
    "97": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-096.jpg?alt=media",
    "98": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-097.jpg?alt=media",
    "99": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-098.jpg?alt=media",
    "100": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-099.jpg?alt=media",
    "101": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-100.jpg?alt=media",
    "102": "https://firebasestorage.googleapis.com/v0/b/comic-world-457306.firebasestorage.app/o/Aliens%20-%20More%20than%20Human%2FAliens%20-%20More%20than%20Human-101.jpg?alt=media"
  }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b863-3d456h719f33",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b863-3d456h719f33",
                "comicContent": {
                    "1": "https://pixeldrain.com/api/file/qhfwZVa6",
                    "2": "https://pixeldrain.com/api/file/dpPPtaX7",
                    "3": "https://pixeldrain.com/api/file/fQp9cKwH",
                    "4": "https://pixeldrain.com/api/file/oYUa2EiA",
                    "5": "https://pixeldrain.com/api/file/ssYQfavH",
                    "6": "https://pixeldrain.com/api/file/7uqWb55b",
                    "7": "https://pixeldrain.com/api/file/ykVwqtGP",
                    "8": "https://pixeldrain.com/api/file/FizqxeHD",
                    "9": "https://pixeldrain.com/api/file/7yVAv5q1",
                    "10": "https://pixeldrain.com/api/file/2d2h5yXZ",
                    "11": "https://pixeldrain.com/api/file/h75poTmC",
                    "12": "https://pixeldrain.com/api/file/rkv3FgEo",
                    "13": "https://pixeldrain.com/api/file/7MQV1eAo",
                    "14": "https://pixeldrain.com/api/file/a2JjXGTq",
                    "15": "https://pixeldrain.com/api/file/zPWPMPWx",
                    "16": "https://pixeldrain.com/api/file/HT7XABQU",
                    "17": "https://pixeldrain.com/api/file/ezNkQkaT",
                    "18": "https://pixeldrain.com/api/file/yQJzFVMs",
                    "19": "https://pixeldrain.com/api/file/Qkqkroz7",
                    "20": "https://pixeldrain.com/api/file/NRKECkoz",
                    "21": "https://pixeldrain.com/api/file/WWM2yESg",
                    "22": "https://pixeldrain.com/api/file/qRGxWjzs",
                    "23": "https://pixeldrain.com/api/file/dEK8cMPL"
                }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b863-3d4fuyfd5f33",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b863-3d4fuyfd5f33",
                "comicContent": {
                    "1": "https://pixeldrain.com/api/file/j2MKQfQZ",
                    "2": "https://pixeldrain.com/api/file/HC7avdMf",
                    "3": "https://pixeldrain.com/api/file/F6WwWTtm",
                    "4": "https://pixeldrain.com/api/file/heGLe6Cq",
                    "5": "https://pixeldrain.com/api/file/3mXBQu9t",
                    "6": "https://pixeldrain.com/api/file/zADSV7Nj",
                    "7": "https://pixeldrain.com/api/file/yP3BkTyH",
                    "8": "https://pixeldrain.com/api/file/3QVq6fK7",
                    "9": "https://pixeldrain.com/api/file/CNRmg9kL",
                    "10": "https://pixeldrain.com/api/file/pyPQ5m4B",
                    "11": "https://pixeldrain.com/api/file/E6iUdstx",
                    "12": "https://pixeldrain.com/api/file/Huvju8uu",
                    "13": "https://pixeldrain.com/api/file/mTdgBKfp",
                    "14": "https://pixeldrain.com/api/file/pHo5s8JR",
                    "15": "https://pixeldrain.com/api/file/2RhTrU7G",
                    "16": "https://pixeldrain.com/api/file/g7qjnH9m",
                    "17": "https://pixeldrain.com/api/file/AmNCPqRu",
                    "18": "https://pixeldrain.com/api/file/edyaRbGD",
                    "19": "https://pixeldrain.com/api/file/Wd4sVFhX",
                    "20": "https://pixeldrain.com/api/file/cmuULUJx",
                    "21": "https://pixeldrain.com/api/file/VMpezWGT",
                    "22": "https://pixeldrain.com/api/file/3iA9F2pH",
                    "23": "https://pixeldrain.com/api/file/HS3fUq2u"
                }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b863-3d4fuyffd9d3",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b863-3d4fuyffd9d3",
                "comicContent": {
                    "1": "https://pixeldrain.com/api/file/isxv1ebp",
                    "2": "https://pixeldrain.com/api/file/N92UG36F",
                    "3": "https://pixeldrain.com/api/file/6A3sBGvY",
                    "4": "https://pixeldrain.com/api/file/ScAQz1v5",
                    "5": "https://pixeldrain.com/api/file/ukkYqf1k",
                    "6": "https://pixeldrain.com/api/file/yzrMY17c",
                    "7": "https://pixeldrain.com/api/file/YoFZi11u",
                    "8": "https://pixeldrain.com/api/file/97dhjott",
                    "9": "https://pixeldrain.com/api/file/2X35jBQN",
                    "10": "https://pixeldrain.com/api/file/mQGPGBRk",
                    "11": "https://pixeldrain.com/api/file/bK2bZn1G",
                    "12": "https://pixeldrain.com/api/file/zLGMVBeb",
                    "13": "https://pixeldrain.com/api/file/PFmmHGrm",
                    "14": "https://pixeldrain.com/api/file/p2Z3DqLV",
                    "15": "https://pixeldrain.com/api/file/p9ubcKxp",
                    "16": "https://pixeldrain.com/api/file/DeHbb8Ww",
                    "17": "https://pixeldrain.com/api/file/ym7K1ovZ",
                    "18": "https://pixeldrain.com/api/file/ckwRbEgG",
                    "19": "https://pixeldrain.com/api/file/zudouC11",
                    "20": "https://pixeldrain.com/api/file/xn3vG6vL",
                    "21": "https://pixeldrain.com/api/file/gXBYaLTn"
                }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b863-3d4fgpekt9d3",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b863-3d4fgpekt9d3",
                "comicContent": {
                    "1": "https://pixeldrain.com/api/file/xtD5M6b8",
                    "2": "https://pixeldrain.com/api/file/fK2Mos2o",
                    "3": "https://pixeldrain.com/api/file/spe2rhZK",
                    "4": "https://pixeldrain.com/api/file/i5uG8Qhw",
                    "5": "https://pixeldrain.com/api/file/WznEiCH7",
                    "6": "https://pixeldrain.com/api/file/YGFJU5mW",
                    "7": "https://pixeldrain.com/api/file/v8dLqBad",
                    "8": "https://pixeldrain.com/api/file/3Pi3cdQa",
                    "9": "https://pixeldrain.com/api/file/MdswM7de",
                    "10": "https://pixeldrain.com/api/file/PGeCrQ8d"
                }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b863-hj67djpekt9d3",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b863-hj67djpekt9d3",
                "comicContent": {
                    "1": "https://pixeldrain.com/api/file/rCAnbn4Z",
                    "2": "https://pixeldrain.com/api/file/3psj4TvD",
                    "3": "https://pixeldrain.com/api/file/XrvAHmfd",
                    "4": "https://pixeldrain.com/api/file/Jzzx5n7e",
                    "5": "https://pixeldrain.com/api/file/cthT1ffa",
                    "6": "https://pixeldrain.com/api/file/WkEz3nVY",
                    "7": "https://pixeldrain.com/api/file/bHRZxYNc",
                    "8": "https://pixeldrain.com/api/file/FsZFU2rc",
                    "9": "https://pixeldrain.com/api/file/ABgqmnmN",
                    "10": "https://pixeldrain.com/api/file/n7KdYRZw",
                    "11": "https://pixeldrain.com/api/file/kR5QHM8m",
                    "12": "https://pixeldrain.com/api/file/FSj4c45v",
                    "13": "https://pixeldrain.com/api/file/ozMv1F24",
                    "14": "https://pixeldrain.com/api/file/pTD8S9oW"
                }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b863-hj6pjg5f6t9d3",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b863-hj6pjg5f6t9d3",
                "comicContent": {
                    "1": "https://pixeldrain.com/api/file/wHLgdNLJ",
                    "2": "https://pixeldrain.com/api/file/DdGVUAki",
                    "3": "https://pixeldrain.com/api/file/1u4rM2T9",
                    "4": "https://pixeldrain.com/api/file/aFAzL6NX",
                    "5": "https://pixeldrain.com/api/file/a3YvHLYh",
                    "6": "https://pixeldrain.com/api/file/sDLoJgtV",
                    "7": "https://pixeldrain.com/api/file/sAqMeEdw",
                    "8": "https://pixeldrain.com/api/file/SKL9AK3S",
                    "9": "https://pixeldrain.com/api/file/VvaRnofX",
                    "10": "https://pixeldrain.com/api/file/FeFXc8ev",
                    "11": "https://pixeldrain.com/api/file/mDsydE5S",
                    "12": "https://pixeldrain.com/api/file/iiamfnLL",
                    "13": "https://pixeldrain.com/api/file/4tanksW5",
                    "14": "https://pixeldrain.com/api/file/HLk8gC8W",
                    "15": "https://pixeldrain.com/api/file/JyyYcfAD",
                    "16": "https://pixeldrain.com/api/file/muCHq8pJ"
                }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b863-hjkiebt6f6t9d",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b863-hjkiebt6f6t9d",
                "comicContent": {
                    "1": "https://pixeldrain.com/api/file/ZJG3DiBy",
                    "2": "https://pixeldrain.com/api/file/6iM41w6b",
                    "3": "https://pixeldrain.com/api/file/GhYyXQoJ",
                    "4": "https://pixeldrain.com/api/file/GEadM1hN",
                    "5": "https://pixeldrain.com/api/file/REiiCJfM",
                    "6": "https://pixeldrain.com/api/file/uFUoHxNP",
                    "7": "https://pixeldrain.com/api/file/pBiSht7S",
                    "8": "https://pixeldrain.com/api/file/6cje2KJb",
                    "9": "https://pixeldrain.com/api/file/4sELCwy7",
                    "10": "https://pixeldrain.com/api/file/FcLmjx2Q",
                    "11": "https://pixeldrain.com/api/file/vqHVEqR7",
                    "12": "https://pixeldrain.com/api/file/c89oGJy4",
                    "13": "https://pixeldrain.com/api/file/DBQzyMDT",
                    "14": "https://pixeldrain.com/api/file/A4c2ekz8",
                    "15": "https://pixeldrain.com/api/file/PdgqbLXM"
                }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b863-hjkiuj7thggjk4",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b863-hjkiuj7thggjk4",
                "comicContent": {
                    "1": "https://pixeldrain.com/api/file/MmUqCHu2",
                    "2": "https://pixeldrain.com/api/file/LzUaX5jr",
                    "3": "https://pixeldrain.com/api/file/NL2gP4eq",
                    "4": "https://pixeldrain.com/api/file/s6DHWA9p",
                    "5": "https://pixeldrain.com/api/file/GztswPxT",
                    "6": "https://pixeldrain.com/api/file/TYdy8dDw",
                    "7": "https://pixeldrain.com/api/file/vRCVRNJi",
                    "8": "https://pixeldrain.com/api/file/xhvXkxCb",
                    "9": "https://pixeldrain.com/api/file/6bdTaNKU",
                    "10": "https://pixeldrain.com/api/file/eea11jQ3",
                    "11": "https://pixeldrain.com/api/file/qKZCReMc",
                    "12": "https://pixeldrain.com/api/file/tk4CQDT8",
                    "13": "https://pixeldrain.com/api/file/kmhN2iBp",
                    "14": "https://pixeldrain.com/api/file/PTQ98bdk",
                    "15": "https://pixeldrain.com/api/file/BA1R8crA",
                    "16": "https://pixeldrain.com/api/file/xQsgzkMW"
                }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b863-hjkgjhg55hggjk4",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b863-hjkgjhg55hggjk4",
                "comicContent": {
                    "1": "https://pixeldrain.com/api/file/bMDssZnR",
                    "2": "https://pixeldrain.com/api/file/tLAK8PpG",
                    "3": "https://pixeldrain.com/api/file/qWerV7z4",
                    "4": "https://pixeldrain.com/api/file/BcneWfY9",
                    "5": "https://pixeldrain.com/api/file/nFyXBjDZ",
                    "6": "https://pixeldrain.com/api/file/qV716jHg",
                    "7": "https://pixeldrain.com/api/file/qFXvQ6C2",
                    "8": "https://pixeldrain.com/api/file/m4yFobrq",
                    "9": "https://pixeldrain.com/api/file/thaBf8qc",
                    "10": "https://pixeldrain.com/api/file/zvEZwfJW",
                    "11": "https://pixeldrain.com/api/file/ELe7okuK",
                    "12": "https://pixeldrain.com/api/file/FWsZxmhn"
                }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b863-hoknbtcfegjk43",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b863-hoknbtcfegjk43",
                "comicContent": {
                    "1": "https://pixeldrain.com/api/file/SHiWW9eA",
                    "2": "https://pixeldrain.com/api/file/5d9QzPZe",
                    "3": "https://pixeldrain.com/api/file/fxsDs9dE",
                    "4": "https://pixeldrain.com/api/file/7Qzmjhd7",
                    "5": "https://pixeldrain.com/api/file/jQcAt6aJ",
                    "6": "https://pixeldrain.com/api/file/cwzVpE2R",
                    "7": "https://pixeldrain.com/api/file/Me46BtUK",
                    "8": "https://pixeldrain.com/api/file/PYMrFoRv",
                    "9": "https://pixeldrain.com/api/file/eTxkMTm4",
                    "10": "https://pixeldrain.com/api/file/KEUWSE98",
                    "11": "https://pixeldrain.com/api/file/5yqqZxi2",
                    "12": "https://pixeldrain.com/api/file/oP9f9AW3",
                    "13": "https://pixeldrain.com/api/file/b7jADnwj",
                    "14": "https://pixeldrain.com/api/file/uQXWUSKp",
                    "15": "https://pixeldrain.com/api/file/Dwgi15X9",
                    "16": "https://pixeldrain.com/api/file/v6YQ1Qbc",
                    "17": "https://pixeldrain.com/api/file/YgZBsmYG",
                    "18": "https://pixeldrain.com/api/file/XxX1KrgH",
                    "19": "https://pixeldrain.com/api/file/zs942Gqs"
                }
            },
            {
                "_ownerId": "847ec027-f659-4086-8032-5173e2f9c93a",
                "comicId": "09bb4abb-ad24-438c-b863-hoknbcfgedfghr",
                "_createdOn": 1743355937321,
                "_id": "09bb4abb-ad24-438c-b863-hoknbcfgedfghr",
                "comicContent": {
                    "1": "https://pixeldrain.com/api/file/z2wsAphJ",
                    "2": "https://pixeldrain.com/api/file/vHeK1kah",
                    "3": "https://pixeldrain.com/api/file/9seqjauN",
                    "4": "https://pixeldrain.com/api/file/8xQftTiR",
                    "5": "https://pixeldrain.com/api/file/L3EFAioR",
                    "6": "https://pixeldrain.com/api/file/tJAM8e1r",
                    "7": "https://pixeldrain.com/api/file/PzmzoZQs",
                    "8": "https://pixeldrain.com/api/file/XWQNZ5mK",
                    "9": "https://pixeldrain.com/api/file/4UCsbVJa",
                    "10": "https://pixeldrain.com/api/file/mFmtadFy",
                    "11": "https://pixeldrain.com/api/file/xH2quL4k",
                    "12": "https://pixeldrain.com/api/file/z3rKgm9Q",
                    "13": "https://pixeldrain.com/api/file/q4brFdWB",
                    "14": "https://pixeldrain.com/api/file/APzkncSe",
                    "15": "https://pixeldrain.com/api/file/hU8e51xW",
                    "16": "https://pixeldrain.com/api/file/pR51YLuo",
                    "17": "https://pixeldrain.com/api/file/DRJoS1xS",
                    "18": "https://pixeldrain.com/api/file/8T2rUEHD",
                    "19": "https://pixeldrain.com/api/file/DQtT7st6",
                    "20": "https://pixeldrain.com/api/file/kTcqzNt5",
                    "21": "https://pixeldrain.com/api/file/GQtKW5eN",
                    "22": "https://pixeldrain.com/api/file/EjxR368t",
                    "23": "https://pixeldrain.com/api/file/3umRNVBX",
                    "24": "https://pixeldrain.com/api/file/tNYu84e5",
                    "25": "https://pixeldrain.com/api/file/CwzQvuJR",
                    "26": "https://pixeldrain.com/api/file/iYF2H6E6",
                    "27": "https://pixeldrain.com/api/file/Ep1vFKXb",
                    "28": "https://pixeldrain.com/api/file/PxHzCado",
                    "29": "https://pixeldrain.com/api/file/oVRjGJLf",
                    "30": "https://pixeldrain.com/api/file/FD9mwW8Q",
                    "31": "https://pixeldrain.com/api/file/7qV3jVnd",
                    "32": "https://pixeldrain.com/api/file/kM31LLv2",
                    "33": "https://pixeldrain.com/api/file/HZpWscjF",
                    "34": "https://pixeldrain.com/api/file/e4BCQRmi",
                    "35": "https://pixeldrain.com/api/file/5eZn6ihh",
                    "36": "https://pixeldrain.com/api/file/6hgPcrSK",
                    "37": "https://pixeldrain.com/api/file/U3cRRai4",
                    "38": "https://pixeldrain.com/api/file/sUmnHZ6d",
                    "39": "https://pixeldrain.com/api/file/7i8XEtW7",
                    "40": "https://pixeldrain.com/api/file/eujsBtn2",
                    "41": "https://pixeldrain.com/api/file/BEeCqVTU",
                    "42": "https://pixeldrain.com/api/file/sosaC7Ca",
                    "43": "https://pixeldrain.com/api/file/ngUz9Euu",
                    "44": "https://pixeldrain.com/api/file/PQVvYtiT",
                    "45": "https://pixeldrain.com/api/file/YpYGdVvX",
                    "46": "https://pixeldrain.com/api/file/55kWM7Qw",
                    "47": "https://pixeldrain.com/api/file/AFqxNfKM",
                    "48": "https://pixeldrain.com/api/file/Px7eFfzk"
                }
            },
        ],
    };
    var rules$1 = {
        users: {
            ".create": false,
            ".read": [
                "Owner"
            ],
            ".update": false,
            ".delete": false
        },
        members: {
            ".update": "isOwner(user, get('teams', data.teamId))",
            ".delete": "isOwner(user, get('teams', data.teamId)) || isOwner(user, data)",
            "*": {
                teamId: {
                    ".update": "newData.teamId = data.teamId"
                },
                status: {
                    ".create": "newData.status = 'pending'"
                }
            }
        }
    };
    var settings = {
        identity: identity,
        protectedData: protectedData,
        seedData: seedData,
        rules: rules$1
    };

    const plugins = [
        storage(settings),
        auth(settings),
        util$2(),
        rules(settings)
    ];

    const server = http__default['default'].createServer(requestHandler(plugins, services));

    const port = process.env.PORT || 3030;

    server.listen(port);

    console.log(`Server started on port ${port}. You can make requests to http://localhost:${port}/`);
    console.log(`Admin panel located at http://localhost:${port}/admin`);

    var softuniPracticeServer = server;

    return softuniPracticeServer;

})));
