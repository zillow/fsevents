// export DEBUG_FSEVENTS=1
// unset DEBUG_FSEVENTS
var debug = process.env.DEBUG_FSEVENTS
  ? function () { console.error.apply(console, arguments); }
  : function () {}

/*
** © 2013 by Philipp Dunkel <p.dunkel@me.com>. Licensed under MIT License.
*/

module.exports = FSEventStream;

var libFs = require('fs');
var EventEmitter = require('events').EventEmitter;
var Readable = require('stream').Readable;
var inherits = require('util').inherits;

var FSEvents;
try {
  FSEvents = require('./build/Release/fswatch').FSEvents;
} catch(ex) {
  FSEvents = require('./build/Debug/fswatch').FSEvents;
}

inherits(FSEvents, EventEmitter);
inherits(FSEventStream, Readable);

function FSEventStream(path) {
  if (!(this instanceof FSEventStream)) {
      return new FSEventStream(path);
  }

  Readable.call(this, { objectMode: true });

  this._watch(path);
}

FSEventStream.prototype._watch = function (path) {
  debug('_watch', path);
  this.fsevents = new FSEvents(path);
  this.fsevents.on('fsevent', this._dispatch.bind(this));
};

FSEventStream.prototype.close = function () {
  debug('close', this.fsevents);
  this.fsevents.stop();
  this.push(null);
};

FSEventStream.prototype._getEventType = function (flags) {
  if (FSEvents.kFSEventStreamEventFlagItemCreated   & flags) { return 'created'; }
  if (FSEvents.kFSEventStreamEventFlagItemRemoved   & flags) { return 'deleted'; }
  if (FSEvents.kFSEventStreamEventFlagItemRenamed   & flags) { return 'moved'; }
  if (FSEvents.kFSEventStreamEventFlagItemModified  & flags) { return 'modified'; }
};

FSEventStream.prototype._getFileType = function (flags) {
  if (FSEvents.kFSEventStreamEventFlagItemIsFile    & flags) { return 'file'; }
  if (FSEvents.kFSEventStreamEventFlagItemIsDir     & flags) { return 'directory'; }
  if (FSEvents.kFSEventStreamEventFlagItemIsSymlink & flags) { return 'symlink'; }
};

FSEventStream.prototype._getFileChanges = function (flags) {
  return {
    inode : !!(FSEvents.kFSEventStreamEventFlagItemInodeMetaMod  & flags),
    finder: !!(FSEvents.kFSEventStreamEventFlagItemFinderInfoMod & flags),
    access: !!(FSEvents.kFSEventStreamEventFlagItemChangeOwner   & flags),
    xattrs: !!(FSEvents.kFSEventStreamEventFlagItemXattrMod      & flags)
  };
};

FSEventStream.prototype._dispatch = function (path, flags, id) {
  debug('_dispatch', id, flags, path);
  var stream = this;
  var info = {
    id: id,
    path: path,
    type: stream._getFileType(flags),
    event: stream._getEventType(flags),
    changes: stream._getFileChanges(flags)
  };

  if (info.event === 'moved') {
    libFs.stat(info.path, function (err, stat) {
      if (err || !stat) {
        info.event = 'moved-out';
      } else {
        info.event = 'moved-in';
      }
      stream._publish(info);
    });
  } else {
    stream._publish(info);
  }
};

FSEventStream.prototype._publish = function (info) {
  debug('_publish', info);
  this.push(info);
  if (info.event) {
    this.emit(info.event, info);
  }
};

FSEventStream.prototype._read = function () {
  // no-op, handled via _dispatch + _publish
};
