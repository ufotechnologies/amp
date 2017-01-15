/**
 * Amp custom receiver.
 *
 * @author   Patrick Schroen / https://github.com/pschroen
 * @license  MIT Licensed
 */

/* jshint strict:true, eqeqeq:true, newcap:false, multistr:true, expr:true, loopfunc:true, shadow:true, node:true, indent:4 */
"use strict";

var fs = require('fs'),
    http = require('http'),
    https = require('https'),
    connect = require('connect'),
    session = require('cookie-session'),
    app = connect(),
    secure = fs.existsSync(__dirname + '/amp-key.pem'),
    server = secure ? https.createServer({
        key: fs.readFileSync(__dirname + '/amp-key.pem'),
        cert: fs.readFileSync(__dirname + '/amp-cert.pem')
    }, app) : http.createServer(app),
    io = require('socket.io')(server),
    url = require('url'),
    querystring = require('querystring'),
    request = require('request'),
    crypto = require('crypto'),
    file = new (require('node-static')).Server('_site'),
    twitter = new (require('node-twitter-api'))({
        consumerKey: process.env.TWITTER_CONSUMER_KEY,
        consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
        callback: 'https://amp.ufo.ai/twitter/oauth'
    }),
    trackers = {};

if (secure) {
    http.createServer(function (req, res) {
        req.on('end', function (error) {
            res.writeHead(308, {'Location': 'https://' + req.headers.host + req.url});
            res.end();
        }).resume();
    }).listen(process.env.PORT || 3000);
}

app.use(session({secret:process.env.COOKIE_SECRET}));

app.use(function (req, res) {
    var body = '';
    req.on('data', function (chunk) {
        body += chunk;
    }).on('end', function (error) {
        if (!body.length) {
            var pathname = req.url.split(/[?#]/)[0];
            if (pathname !== '/') {
                if (pathname === '/oauth' || pathname === '/slack/oauth') {
                    var options = {
                            url: 'https://slack.com/api/oauth.access',
                            form: 'client_id=' + process.env.SLACK_CLIENT_ID + '&client_secret=' + process.env.SLACK_CLIENT_SECRET + '&code=' + querystring.parse(url.parse(req.url).query).code
                        };
                    request.post(options, function (error, response, body) {
                        var access = JSON.parse(body);
                        if (access.bot) {
                            var crypted = cbcEncrypt(access.bot.bot_access_token, process.env.CRYPTO_KEY, process.env.CRYPTO_IV);
                            res.writeHead(200, 'OK', {'Content-Type': 'text/html'});
                            res.write(fs.readFileSync(__dirname + '/_site/token.html').toString().replace('<p></p>', '<p>' + crypted + (req.headers['user-agent'].match(/Android/i) ? '<br><a href="intent://token/?' + crypted + '#Intent;scheme=amp;package=ai.ufo.amp;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dai.ufo.amp;end">Open in Amp</a>' : '') + '</p>'));
                        } else {
                            res.writeHead(302, {'Location': 'https://play.google.com/store/apps/details?id=ai.ufo.amp'});
                        }
                        res.end();
                    });
                } else if (pathname === '/twitter/oauth/authorize') {
                    twitter.getRequestToken(function (error, requestToken, requestTokenSecret, results) {
                        if (!error) {
                            req.session.requestToken = requestToken;
                            req.session.requestTokenSecret = requestTokenSecret;
                            res.writeHead(302, {'Location': 'https://api.twitter.com/oauth/authenticate?oauth_token=' + requestToken});
                        } else {
                            res.writeHead(302, {'Location': 'https://play.google.com/store/apps/details?id=ai.ufo.amp'});
                        }
                        res.end();
                    });
                } else if (pathname === '/twitter/oauth') {
                    twitter.getAccessToken(req.session.requestToken, req.session.requestTokenSecret, querystring.parse(url.parse(req.url).query).oauth_verifier, function (error, accessToken, accessTokenSecret, results) {
                        if (!error) {
                            var crypted = cbcEncrypt(accessToken + '\n' + accessTokenSecret, process.env.CRYPTO_KEY, process.env.CRYPTO_IV);
                            res.writeHead(200, 'OK', {'Content-Type': 'text/html'});
                            res.write(fs.readFileSync(__dirname + '/_site/token.html').toString().replace('<p></p>', '<p>' + crypted + (req.headers['user-agent'].match(/Android/i) ? '<br><a href="intent://token/?' + crypted + '#Intent;scheme=amp;package=ai.ufo.amp;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dai.ufo.amp;end">Open in Amp</a>' : '') + '</p>').replace('Slack bot', 'Twitter bot').replace('guide_amp_online.png', 'jellybean_twitter.png'));
                        } else {
                            res.writeHead(302, {'Location': 'https://play.google.com/store/apps/details?id=ai.ufo.amp'});
                        }
                        res.end();
                    });
                } else if (pathname === '/support' || pathname === '/support/') {
                    file.serveFile('support/index.html', 200, {}, req, res);
                } else if (pathname === '/privacy' || pathname === '/privacy/') {
                    file.serveFile('privacy/index.html', 200, {}, req, res);
                } else if (pathname === '/licenses' || pathname === '/licenses/') {
                    file.serveFile('licenses/index.html', 200, {}, req, res);
                } else if (!fs.existsSync(__dirname + '/_site' + pathname)) {
                    file.serveFile('custom/receiver.html', 200, {}, req, res);
                } else {
                    file.serve(req, res);
                }
            } else {
                res.writeHead(302, {'Location': 'https://ufo.ai/amp/'});
                res.end();
            }
        } else {
            var data = JSON.parse(body),
                pathname = req.url.replace(/.*\//, '');
            if (!trackers[pathname]) {
                trackers[pathname] = {
                    sockets: [],
                    nowplaying: data.nowplaying,
                    tracks: data.tracks
                };
            } else {
                trackers[pathname].nowplaying = data.nowplaying;
                trackers[pathname].tracks = data.tracks;
                for (var i = 0; i < trackers[pathname].sockets.length; i++)
                    trackers[pathname].sockets[i].emit('track', {nowplaying:trackers[pathname].nowplaying, tracks:trackers[pathname].tracks});
            }
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end('OK\n');
        }
    }).resume();
});

server.listen(secure ? 8443 : process.env.PORT || 3000);

io.on('connection', function (socket) {
    var pathname = socket.request._query.pathname.substring(1);
    if (!trackers[pathname]) {
        trackers[pathname] = {
            sockets: [socket],
            nowplaying: null,
            tracks: null
        };
    } else {
        trackers[pathname].sockets.push(socket);
    }
    socket.emit('track', {nowplaying:trackers[pathname].nowplaying, tracks:trackers[pathname].tracks});
});

function cbcEncrypt(data, secretKey, iv) {
    secretKey = new Buffer(secretKey, 'utf8');
    secretKey = crypto.createHash('md5').update(secretKey).digest('hex');
    secretKey = new Buffer(secretKey, 'hex');
    var cipher = crypto.createCipheriv('aes-128-cbc', secretKey, new Buffer(iv, 'utf8')), coder = [];
    coder.push(cipher.update(data, 'utf8', 'base64'));
    coder.push(cipher.final('base64'));
    return coder.join('');
}
