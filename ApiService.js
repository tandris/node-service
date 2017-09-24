const restify = require('restify');
const restifySwaggerJsdoc = require('restify-swagger-jsdoc');
const Service = require('./Service');
const winston = require('winston');

class ApiService extends Service {

  configure(config, cb) {
    this.port = config.port ? parseInt(process.env[config.port]) : 3000;
    this.baseDir = config.baseDir;
    super.configure(config, cb);
  }

  init(cb) {
    let self = this;
    let server = restify.createServer({});
    server.use(restify.plugins.bodyParser());
    server.use(restify.plugins.queryParser());

    this.initRoutes(server);

    restifySwaggerJsdoc.createSwaggerPage({
      title: 'API documentation', // Page title (required)
      version: '1.0.0', // Server version (required)
      server: server, // Restify server instance created with restify.createServer()
      path: '/docs/swagger', // Public url where the swagger page will be available
      apis: [this.baseDir + '/**/*Api.js'], // Path to the API docs
    });

    server.listen(this.port, function () {
      winston.log('info', '%s listening at %s', server.name, server.url);
      cb();
    });
  }

  initRoutes(server) {
    throw new Error('Unimplimented add routes method.');
  }
}

module.exports = ApiService;
