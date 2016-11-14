/**
 * Amp custom receiver.
 *
 * @author   Patrick Schroen / https://github.com/pschroen
 * @license  MIT Licensed
 */

/* jshint strict:true, eqeqeq:true, newcap:false, multistr:true, expr:true, loopfunc:true, shadow:true, node:true, indent:4 */
"use strict";

var file = new (require('node-static')).Server('_site'),
    app = require('http').createServer(handler),
    io = require('socket.io')(app),
    fs = require('fs'),
    trackers = {};

app.listen(process.env.PORT || 3000);

function handler(req, res) {
    var body = '';
    req.on('data', function (chunk) {
        body += chunk;
    }).on('end', function (error) {
        if (!body.length) {
            var pathname = req.url.split(/[?#]/)[0];
            if (pathname !== '/') {
                if (pathname === '/privacy' || pathname === '/privacy/') {
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
}

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
