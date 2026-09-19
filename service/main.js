import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       * @param {Boolean} [isServer=false] Create the instance in either server or
       *     client mode
       * @param {Number} [maxPayload=0] The maximum allowed message length
       */
      constructor(options, isServer, maxPayload) {
        this._maxPayload = maxPayload | 0;
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._isServer = !!isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var PerMessageDeflate = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else {
            buf.set(data, 2);
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent2 = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent2.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent2("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent: MessageEvent2
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension) => {
        let configurations = extensions[extension];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http3 = __require("http");
    var net2 = __require("net");
    var tls = __require("tls");
    var { randomBytes, createHash } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL2 } = __require("url");
    var PerMessageDeflate = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var closeTimeout = 30 * 1e3;
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate.extensionName]) {
          this._extensions[PerMessageDeflate.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        protocolVersion: protocolVersions[1],
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch (e) {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http3.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate(
          opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
          false,
          opts.maxPayload
        );
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net2.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net2.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      let chunk;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && (chunk = websocket._socket.read()) !== null) {
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http3 = __require("http");
    var { Duplex } = __require("stream");
    var { createHash } = __require("crypto");
    var extension = require_extension();
    var PerMessageDeflate = require_permessage_deflate();
    var subprotocol = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http3.createServer((req, res) => {
            const body = http3.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate(
            this.options.perMessageDeflate,
            true,
            this.options.maxPayload
          );
          try {
            const offers = extension.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
              extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate.extensionName]) {
          const params = extensions[PerMessageDeflate.extensionName].params;
          const value = extension.format({
            [PerMessageDeflate.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http3.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http3.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// src/main.js
import path3 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/page-scripts.js
var MAX_TEXT_CHARS = 6e3;
var MAX_ELEMENTS = 120;
var MAX_LABEL_CHARS = 80;
var HELPERS = `
  var MAX_ELEMENTS = ${MAX_ELEMENTS};
  var MAX_LABEL_CHARS = ${MAX_LABEL_CHARS};
  var visible = function (element) {
    var rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    var style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
  };
  var label = function (element) {
    var aria = element.getAttribute('aria-label');
    if (aria) return aria.trim();
    var text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text) return text.slice(0, MAX_LABEL_CHARS);
    var value = element.getAttribute('value');
    if (value) return String(value).slice(0, MAX_LABEL_CHARS);
    var placeholder = element.getAttribute('placeholder');
    return placeholder ? placeholder.trim().slice(0, MAX_LABEL_CHARS) : '';
  };
  var unique = function (selector) {
    try { return document.querySelectorAll(selector).length === 1; } catch { return false; }
  };
  var cssPath = function (element) {
    var tag = element.tagName.toLowerCase();
    if (element.id) {
      var byId = '#' + CSS.escape(element.id);
      if (unique(byId)) return byId;
    }
    var attrs = ['data-testid', 'data-test-id', 'data-test', 'name', 'aria-label'];
    for (var a = 0; a < attrs.length; a += 1) {
      var raw = element.getAttribute(attrs[a]);
      if (!raw || String(raw).indexOf('"') !== -1) continue;
      var byAttr = tag + '[' + attrs[a] + '="' + String(raw) + '"]';
      if (unique(byAttr)) return byAttr;
    }
    var parts = [];
    var node = element;
    for (var depth = 0; node && node.nodeType === 1 && depth < 6; depth += 1) {
      var part = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (!parent) { parts.unshift(part); break; }
      var siblings = Array.prototype.filter.call(parent.children, function (child) {
        return child.tagName === node.tagName;
      });
      if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  };
  var accessibleName = function (element) {
    var aria = element.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    var labelled = element.getAttribute('aria-labelledby');
    if (labelled) {
      var source = document.getElementById(labelled.split(/\\s+/)[0]);
      if (source && (source.innerText || '').trim()) return source.innerText.trim();
    }
    var named = element.getAttribute('title') || element.getAttribute('alt');
    if (named && named.trim()) return named.trim();
    var text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
    return text || String(element.getAttribute('value') || '').trim();
  };
  var findByText = function (needle) {
    var wanted = String(needle).replace(/\\s+/g, ' ').trim().toLowerCase();
    var nodes = document.querySelectorAll('a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], summary, label');
    var partial = null;
    for (var i = 0; i < nodes.length; i += 1) {
      var element = nodes[i];
      if (!visible(element)) continue;
      var text = label(element).toLowerCase();
      if (text === wanted) return element;
      if (!partial && text.indexOf(wanted) !== -1) partial = element;
    }
    return partial;
  };
`;
var wrapPageScript = (body) => `(() => {
${HELPERS}
${body}
})()`;
var buildSnapshotScript = ({ selector } = {}) => wrapPageScript(`
  var scopeSelector = ${JSON.stringify(selector ?? "")};
  var root = document;
  if (scopeSelector) {
    try { root = document.querySelector(scopeSelector); }
    catch { return { ok: false, error: 'Invalid selector: ' + scopeSelector }; }
    if (!root) return { ok: false, error: 'No element matches ' + scopeSelector };
  }
  var interactive = root.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [contenteditable="true"]');
  var elements = [];
  var visibleTotal = 0;
  for (var i = 0; i < interactive.length; i += 1) {
    var element = interactive[i];
    if (!visible(element)) continue;
    visibleTotal += 1;
    if (elements.length >= MAX_ELEMENTS) continue;
    var rect = element.getBoundingClientRect();
    var entry = {
      selector: cssPath(element), tag: element.tagName.toLowerCase(),
      bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    };
    if (rect.bottom > 0 && rect.top < window.innerHeight) entry.inViewport = true;
    var type = element.getAttribute('type'); if (type) entry.type = type;
    var role = element.getAttribute('role'); if (role) entry.role = role;
    var text = label(element); if (text) entry.label = text;
    if (element.disabled === true) entry.disabled = true;
    if (!accessibleName(element)) entry.missingAccessibleName = true;
    elements.push(entry);
  }
  var raw = document.body ? (document.body.innerText || '') : '';
  var text = raw.replace(/\\n{3,}/g, '\\n\\n').trim();
  var result = {
    ok: true, url: String(location.href), title: String(document.title || ''),
    scope: scopeSelector || 'document', scrollY: Math.round(window.scrollY),
    maxScrollY: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight)),
    text: text.slice(0, ${MAX_TEXT_CHARS}), elements: elements
  };
  if (text.length > ${MAX_TEXT_CHARS}) { result.textTruncated = true; result.textTotalChars = text.length; }
  if (visibleTotal > elements.length) { result.elementsTruncated = true; result.interactiveElementsOnPage = visibleTotal; }
  return result;
`);
var buildClickScript = ({ selector, text: text2 }) => wrapPageScript(`
  var selector = ${JSON.stringify(selector ?? "")};
  var labelText = ${JSON.stringify(text2 ?? "")};
  var target = null;
  if (selector) {
    try { target = document.querySelector(selector); }
    catch { return { ok: false, error: 'Invalid selector: ' + selector }; }
    if (!target) return { ok: false, error: 'No element matches ' + selector };
  } else {
    target = findByText(labelText);
    if (!target) return { ok: false, error: 'No clickable element has the label ' + labelText };
  }
  if (target.disabled === true) return { ok: false, error: 'Element is disabled' };
  target.scrollIntoView({ block: 'center', inline: 'center' });
  target.click();
  return { ok: true, clicked: cssPath(target), label: label(target), url: String(location.href) };
`);
var buildTypeScript = ({ selector, value, submit }) => wrapPageScript(`
  var selector = ${JSON.stringify(selector)};
  var value = ${JSON.stringify(value)};
  var target = null;
  try { target = document.querySelector(selector); }
  catch { return { ok: false, error: 'Invalid selector: ' + selector }; }
  if (!target) return { ok: false, error: 'No element matches ' + selector };
  var editable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
  if (!editable) return { ok: false, error: selector + ' is not a text field' };
  if (target.disabled === true || target.readOnly === true) return { ok: false, error: 'Field is not editable' };
  target.scrollIntoView({ block: 'center' }); target.focus();
  if (target.isContentEditable) target.textContent = value;
  else {
    var prototype = target.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (setter && setter.set) setter.set.call(target, value); else target.value = value;
  }
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  if (${submit ? "true" : "false"}) {
    var event = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
    target.dispatchEvent(new KeyboardEvent('keydown', event));
    target.dispatchEvent(new KeyboardEvent('keyup', event));
    if (target.form && typeof target.form.requestSubmit === 'function') target.form.requestSubmit();
  }
  return { ok: true, selector: cssPath(target), url: String(location.href) };
`);

// src/page-scripts-more.js
var INSPECTED_STYLE_PROPERTIES = [
  "color",
  "background-color",
  "background-image",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "border-radius",
  "border-width",
  "border-style",
  "border-color",
  "box-shadow",
  "display",
  "position",
  "width",
  "height",
  "padding",
  "margin",
  "gap",
  "flex-direction",
  "justify-content",
  "align-items",
  "z-index",
  "overflow",
  "visibility"
];
var buildScrollScript = ({ selector, direction }) => wrapPageScript(`
  var selector = ${JSON.stringify(selector ?? "")};
  var direction = ${JSON.stringify(direction ?? "")};
  var settle = function (extra) {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        var maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        var current = Math.round(window.scrollY);
        resolve(Object.assign({
          ok: true, scrollY: current, maxScrollY: Math.round(maximum),
          atTop: current <= 1, atBottom: current >= maximum - 1
        }, extra));
      }); });
    });
  };
  if (selector) {
    var target = null;
    try { target = document.querySelector(selector); }
    catch { return { ok: false, error: 'Invalid selector: ' + selector }; }
    if (!target) return { ok: false, error: 'No element matches ' + selector };
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    return settle({ scrolledTo: cssPath(target) });
  }
  var page = Math.round(window.innerHeight * 0.85);
  var bottom = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  if (direction === 'down') window.scrollTo({ top: window.scrollY + page, behavior: 'instant' });
  else if (direction === 'up') window.scrollTo({ top: window.scrollY - page, behavior: 'instant' });
  else if (direction === 'top') window.scrollTo({ top: 0, behavior: 'instant' });
  else if (direction === 'bottom') window.scrollTo({ top: bottom, behavior: 'instant' });
  else return { ok: false, error: 'Unknown scroll direction: ' + direction };
  return settle({ direction: direction });
`);
var buildInspectScript = ({ selector }) => wrapPageScript(`
  var selector = ${JSON.stringify(selector)};
  var target = null;
  try { target = document.querySelector(selector); }
  catch { return { ok: false, error: 'Invalid selector: ' + selector }; }
  if (!target) return { ok: false, error: 'No element matches ' + selector };
  var computed = window.getComputedStyle(target);
  var styles = {};
  var properties = ${JSON.stringify(INSPECTED_STYLE_PROPERTIES)};
  for (var i = 0; i < properties.length; i += 1) {
    var value = computed.getPropertyValue(properties[i]);
    if (value) styles[properties[i]] = String(value).trim();
  }
  var rect = target.getBoundingClientRect();
  return {
    ok: true, selector: cssPath(target), tag: target.tagName.toLowerCase(), label: label(target),
    bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    inViewport: rect.bottom > 0 && rect.top < window.innerHeight, styles: styles
  };
`);

// src/viewports.js
var PRESETS = Object.freeze({
  mobile: Object.freeze({ width: 390, height: 844, mobile: true }),
  tablet: Object.freeze({ width: 768, height: 1024, mobile: false }),
  desktop: Object.freeze({ width: 1440, height: 900, mobile: false })
});
var viewportForMode = (mode) => mode === "fill" ? null : PRESETS[mode];
var viewportSummary = (viewport) => {
  if (viewport === null) return { mode: "fill", width: null, height: null };
  for (const [mode, preset] of Object.entries(PRESETS)) {
    if (preset.width === viewport.width && preset.height === viewport.height) {
      return { mode, width: viewport.width, height: viewport.height };
    }
  }
  return { mode: "custom", width: viewport.width, height: viewport.height };
};
var applyViewport = async (cdp, sessionId, viewport) => {
  if (viewport === null) {
    await cdp.sendSession(sessionId, "Emulation.clearDeviceMetricsOverride");
    return;
  }
  await cdp.sendSession(sessionId, "Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile
  });
};

// src/browser-actions.js
var OPEN_SETTLE_MS = 3e4;
var withAbort = async (signal, operation) => {
  signal?.throwIfAborted();
  if (!signal) return operation;
  let rejectAbort;
  const aborted = new Promise((resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort(signal.reason ?? new DOMException("Action cancelled", "AbortError"));
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
};
var evaluate = async (page, expression, signal) => {
  const response = await withAbort(signal, page.cdp.sendSession(page.sessionId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  }));
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Page script failed");
  }
  return response.result?.value ?? null;
};
var runPageScript = async (page, expression, signal) => {
  const result = await evaluate(page, expression, signal);
  if (!result || typeof result !== "object") throw new Error("The page returned no result");
  if (result.ok !== true) throw new Error(typeof result.error === "string" ? result.error : "Browser action failed");
  const { ok: _ok, ...data } = result;
  return data;
};
var readPageInfo = async (page, signal) => {
  const value = await evaluate(page, '({ url: String(location.href), title: String(document.title || "") })', signal);
  return {
    url: typeof value?.url === "string" ? value.url : "",
    title: typeof value?.title === "string" ? value.title : ""
  };
};
var waitForLoad = (page, timeoutMs, signal) => new Promise((resolve, reject) => {
  let unsubscribe = null;
  const cleanup = () => {
    clearTimeout(timer);
    unsubscribe?.();
    signal?.removeEventListener("abort", onAbort);
  };
  const finish = (settled) => {
    cleanup();
    resolve(settled);
  };
  const onAbort = () => {
    cleanup();
    reject(signal.reason ?? new DOMException("Action cancelled", "AbortError"));
  };
  const timer = setTimeout(() => finish(false), timeoutMs);
  timer.unref?.();
  unsubscribe = page.cdp.onEvent((event) => {
    if (event.sessionId === page.sessionId && event.method === "Page.loadEventFired") finish(true);
  });
  signal?.addEventListener("abort", onAbort, { once: true });
});
var startLoadWait = (page, timeoutMs, signal) => {
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const promise = waitForLoad(page, timeoutMs, combined);
  return {
    promise,
    async cancel() {
      controller.abort(new DOMException("Navigation cancelled", "AbortError"));
      await promise.catch(() => {
      });
    }
  };
};
var navigateHistory = async (page, goingBack, signal) => {
  const history = await withAbort(signal, page.cdp.sendSession(page.sessionId, "Page.getNavigationHistory"));
  const currentIndex = typeof history.currentIndex === "number" ? history.currentIndex : -1;
  const nextIndex = goingBack ? currentIndex - 1 : currentIndex + 1;
  const entry = Array.isArray(history.entries) ? history.entries[nextIndex] : null;
  if (!entry) throw new Error(goingBack ? "There is nothing to go back to" : "There is nothing to go forward to");
  const load = startLoadWait(page, 8e3, signal);
  try {
    await withAbort(signal, page.cdp.sendSession(page.sessionId, "Page.navigateToHistoryEntry", { entryId: entry.id }));
  } catch (error) {
    await load.cancel();
    throw error;
  }
  const state = await evaluate(page, '({ url: String(location.href), complete: document.readyState === "complete" })', signal);
  if (state?.complete === true && state.url === entry.url) await load.cancel();
  else await load.promise;
  return readPageInfo(page, signal);
};
var createBrowserActions = (runtime) => async (action, parameters, signal) => {
  if (action === "browser.open") {
    const url = new URL(parameters.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Open an absolute http(s) URL");
    const page2 = await runtime.ensurePage();
    const requestedViewport = parameters.viewport ? viewportForMode(parameters.viewport) : runtime.viewport;
    await runtime.setViewport(requestedViewport);
    runtime.clearConsoleProblems();
    const load = startLoadWait(page2, OPEN_SETTLE_MS, signal);
    let navigation;
    try {
      navigation = await withAbort(signal, page2.cdp.sendSession(page2.sessionId, "Page.navigate", { url: url.href }));
      if (navigation.errorText) throw new Error(`Navigation failed: ${navigation.errorText}`);
    } catch (error) {
      await load.cancel();
      throw error;
    }
    const settled = await load.promise;
    const info = await readPageInfo(page2, signal);
    return { ...info, opened: true, settled, viewport: viewportSummary(runtime.viewport) };
  }
  const page = await runtime.ensurePage();
  if (action === "browser.snapshot") {
    const data = await runPageScript(page, buildSnapshotScript(parameters), signal);
    const problems = runtime.consoleProblems;
    return {
      ...data,
      viewport: viewportSummary(runtime.viewport),
      ...problems.length > 0 ? { consoleProblems: problems } : {}
    };
  }
  if (action === "browser.click") return runPageScript(page, buildClickScript(parameters), signal);
  if (action === "browser.type") return runPageScript(page, buildTypeScript(parameters), signal);
  if (action === "browser.scroll") return runPageScript(page, buildScrollScript(parameters), signal);
  if (action === "browser.inspect") return runPageScript(page, buildInspectScript(parameters), signal);
  if (action === "browser.back") return navigateHistory(page, true, signal);
  if (action === "browser.forward") return navigateHistory(page, false, signal);
  if (action === "browser.resize") {
    await runtime.setViewport(viewportForMode(parameters.viewport));
    return { viewport: viewportSummary(runtime.viewport) };
  }
  if (action === "browser.capture") {
    await withAbort(signal, page.cdp.sendSession(page.sessionId, "Page.enable"));
    const capture = await withAbort(signal, page.cdp.sendSession(page.sessionId, "Page.captureScreenshot", { format: "png" }));
    const metrics = await withAbort(signal, page.cdp.sendSession(page.sessionId, "Page.getLayoutMetrics"));
    const info = await readPageInfo(page, signal);
    const viewport = metrics.cssLayoutViewport ?? metrics.layoutViewport;
    return {
      base64: typeof capture.data === "string" ? capture.data : "",
      mime: "image/png",
      width: Math.round(viewport?.clientWidth ?? runtime.viewport?.width ?? 0),
      height: Math.round(viewport?.clientHeight ?? runtime.viewport?.height ?? 0),
      ...info,
      viewport: viewportSummary(runtime.viewport)
    };
  }
  throw new Error(`Unsupported browser action: ${action}`);
};

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);

// src/cdp-client.js
var commandError = (method, reason) => new Error(`CDP command ${method} failed: ${reason}`);
var connectCdp = async (webSocketDebuggerUrl, {
  commandTimeoutMs = 3e4,
  handshakeTimeoutMs = 1e4
} = {}) => {
  const socket = new import_websocket.default(webSocketDebuggerUrl, {
    maxPayload: 256 * 1024 * 1024,
    perMessageDeflate: false,
    handshakeTimeout: handshakeTimeoutMs
  });
  const pending = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  let nextId = 1;
  let open = false;
  const rejectPending = (reason) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timeout);
      entry.reject(commandError(entry.method, reason));
    }
    pending.clear();
  };
  const disconnect = (reason) => {
    if (!open && pending.size === 0) return;
    open = false;
    rejectPending(reason);
  };
  const sendCommand = (method, params = {}, sessionId) => {
    if (!open || socket.readyState !== import_websocket.default.OPEN) {
      return Promise.reject(commandError(method, "connection is closed"));
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(commandError(method, `timed out after ${commandTimeoutMs}ms`));
      }, commandTimeoutMs);
      timeout.unref?.();
      pending.set(id, { method, sessionId, resolve, reject, timeout });
      try {
        socket.send(JSON.stringify({ id, method, params, ...sessionId ? { sessionId } : {} }));
      } catch (error) {
        clearTimeout(timeout);
        pending.delete(id);
        reject(commandError(method, error instanceof Error ? error.message : String(error)));
      }
    });
  };
  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString("utf8"));
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    if (Number.isInteger(message.id)) {
      const entry = pending.get(message.id);
      if (!entry || entry.sessionId !== message.sessionId) return;
      pending.delete(message.id);
      clearTimeout(entry.timeout);
      if (message.error) entry.reject(commandError(entry.method, message.error.message || "protocol error"));
      else entry.resolve(message.result ?? {});
      return;
    }
    if (typeof message.method !== "string") return;
    for (const listener of listeners) {
      try {
        listener({ method: message.method, params: message.params ?? {}, sessionId: message.sessionId });
      } catch {
      }
    }
  });
  socket.on("close", () => disconnect("connection closed"));
  socket.on("error", (error) => disconnect(error instanceof Error ? error.message : "connection error"));
  await new Promise((resolve, reject) => {
    const handshakeTimer = setTimeout(() => {
      cleanup();
      try {
        socket.terminate();
      } catch {
      }
      reject(new Error(`WebSocket opening handshake timed out after ${handshakeTimeoutMs}ms`));
    }, handshakeTimeoutMs);
    handshakeTimer.unref?.();
    const cleanup = () => {
      clearTimeout(handshakeTimer);
      socket.off("open", onOpen);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    const onOpen = () => {
      cleanup();
      open = true;
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const onClose = () => {
      cleanup();
      reject(new Error("CDP connection closed before opening"));
    };
    socket.once("open", onOpen);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
  return {
    send: (method, params = {}) => sendCommand(method, params),
    sendSession: (sessionId, method, params = {}) => sendCommand(method, params, sessionId),
    async attach(targetId) {
      const result = await sendCommand("Target.attachToTarget", { targetId, flatten: true });
      if (typeof result.sessionId !== "string") throw new Error("Chrome returned no target session id");
      return result.sessionId;
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      if (!open) return;
      disconnect("connection closed by client");
      try {
        socket.terminate();
      } catch {
      }
    },
    get isOpen() {
      return open && socket.readyState === import_websocket.default.OPEN;
    }
  };
};

// src/chrome-process.js
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var MINIMUM_CHROME_MAJOR_VERSION = 109;
var SYSTEM_NAMES = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
var executable = (candidate) => {
  try {
    fs.accessSync(candidate, process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};
var systemCandidates = () => {
  if (process.platform === "darwin") {
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  }
  if (process.platform === "win32") {
    const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
    return roots.map((root) => path.join(root, "Google", "Chrome", "Application", "chrome.exe"));
  }
  const entries = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  return [...entries, "/usr/bin", "/usr/sbin", "/usr/local/bin", "/snap/bin"].flatMap((entry) => SYSTEM_NAMES.map((name) => path.join(entry, name)));
};
var resolveChromePath = (configuredPath) => {
  if (configuredPath) {
    if (executable(configuredPath)) return configuredPath;
    throw new Error(`config.chromePath is not an executable Chrome or Chromium binary: ${configuredPath}`);
  }
  const discovered = systemCandidates().find(executable);
  if (discovered) return discovered;
  throw new Error("Chrome or Chromium was not found. Set chromePath in config.json.");
};
var parseEndpoint = (contents) => {
  const [portLine, socketPath] = contents.split(/\r?\n/);
  const port = Number.parseInt(portLine?.trim() || "", 10);
  const suffix = socketPath?.trim() || "";
  if (!Number.isInteger(port) || !suffix.startsWith("/devtools/browser/")) return null;
  return `ws://127.0.0.1:${port}${suffix}`;
};
var wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
var probeVersion = async (endpoint) => {
  const cdp = await connectCdp(endpoint, { commandTimeoutMs: 5e3 });
  try {
    const version = await cdp.send("Browser.getVersion");
    const match = `${version.product ?? ""} ${version.userAgent ?? ""}`.match(/(?:Chrome|Chromium)\/(\d+)/i);
    if (!match) throw new Error("Chrome returned no recognizable major version");
    const major = Number.parseInt(match[1], 10);
    if (major < MINIMUM_CHROME_MAJOR_VERSION) {
      throw new Error(`Chrome ${MINIMUM_CHROME_MAJOR_VERSION}+ is required, but Chrome ${major} was found`);
    }
    return { ...version, major };
  } finally {
    cdp.close();
  }
};
var createChromeProcess = ({ chromePath = null, startupTimeoutMs = 15e3 } = {}) => {
  let launchPromise = null;
  let child = null;
  let profileDir = null;
  let result = null;
  let closed = false;
  const removeProfile = async () => {
    if (!profileDir) return;
    const directory = profileDir;
    profileDir = null;
    await fs.promises.rm(directory, { recursive: true, force: true });
  };
  const killChild = () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform !== "win32" && Number.isInteger(child.pid)) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
      }
    }
    try {
      child.kill("SIGKILL");
    } catch {
    }
  };
  const waitForExit = (processToWait) => {
    if (!processToWait || processToWait.exitCode !== null || processToWait.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => processToWait.once("exit", resolve));
  };
  const launch = async () => {
    const binary = resolveChromePath(chromePath);
    profileDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openchamber-server-browser-"));
    await fs.promises.chmod(profileDir, 448);
    if (closed) throw new Error("Chrome launch was cancelled");
    child = spawn(binary, [
      "--headless=new",
      "--webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--password-store=basic",
      "about:blank"
    ], {
      env: { ...process.env },
      stdio: ["ignore", "ignore", "ignore"],
      detached: process.platform !== "win32",
      windowsHide: true
    });
    let exitError = null;
    child.once("error", (error) => {
      exitError = new Error(`Chrome failed to spawn: ${error.message}`);
    });
    child.once("exit", (code, signal) => {
      if (!closed && !result) exitError = new Error(`Chrome exited during startup (code ${code ?? "null"}, signal ${signal ?? "none"})`);
    });
    const deadline = Date.now() + startupTimeoutMs;
    const activePortPath = path.join(profileDir, "DevToolsActivePort");
    let endpoint = null;
    while (!endpoint && Date.now() < deadline) {
      if (closed) throw new Error("Chrome launch was cancelled");
      if (exitError) throw exitError;
      try {
        endpoint = parseEndpoint(await fs.promises.readFile(activePortPath, "utf8"));
      } catch {
      }
      if (!endpoint) await wait(40);
    }
    if (!endpoint) throw new Error("Timed out waiting for Chrome DevTools readiness");
    const version = await probeVersion(endpoint);
    if (closed) throw new Error("Chrome launch was cancelled");
    result = { endpoint, version, process: child, profileDir };
    return result;
  };
  return {
    ensure() {
      if (closed) return Promise.reject(new Error("Chrome process manager is closed"));
      if (result) return Promise.resolve(result);
      if (!launchPromise) {
        launchPromise = launch().catch(async (error) => {
          killChild();
          await removeProfile();
          throw error;
        });
      }
      return launchPromise;
    },
    async close() {
      if (closed) return;
      closed = true;
      const processToWait = child;
      const exited = waitForExit(processToWait);
      killChild();
      await launchPromise?.catch(() => {
      });
      await exited;
      await removeProfile();
      child = null;
      result = null;
    },
    get process() {
      return child;
    },
    get profileDir() {
      return profileDir;
    }
  };
};

// src/config.js
import fs2 from "node:fs";
import path2 from "node:path";
import { fileURLToPath } from "node:url";
var HTTP_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:"]);
var parseAllowedOrigin = (value, index) => {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error(`config.allowedOrigins[${index}] must be a non-empty origin`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`config.allowedOrigins[${index}] is not a valid URL origin`);
  }
  if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`config.allowedOrigins[${index}] must be an http(s) origin without credentials, path, query, or hash`);
  }
  return url.origin;
};
var extensionRootFrom = (entryUrl) => path2.resolve(path2.dirname(fileURLToPath(entryUrl)), "..");
var parseConfig = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("config.json must contain an object");
  }
  const chromePath = value.chromePath;
  if (chromePath !== void 0 && (typeof chromePath !== "string" || chromePath.trim().length === 0)) {
    throw new Error("config.chromePath must be a non-empty string when provided");
  }
  if (value.allowedOrigins !== void 0 && !Array.isArray(value.allowedOrigins)) {
    throw new Error("config.allowedOrigins must be an array");
  }
  const allowedOrigins = (value.allowedOrigins ?? []).map(parseAllowedOrigin);
  return Object.freeze({
    chromePath: chromePath?.trim() ?? null,
    allowedOrigins: Object.freeze([...new Set(allowedOrigins)])
  });
};
var loadConfig = ({ entryUrl = import.meta.url, configPath } = {}) => {
  const resolvedPath = configPath ?? path2.join(extensionRootFrom(entryUrl), "config.json");
  try {
    return parseConfig(JSON.parse(fs2.readFileSync(resolvedPath, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return parseConfig({});
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${resolvedPath}: ${error.message}`);
    throw error;
  }
};
var originGrants = (allowedOrigins) => allowedOrigins.map((origin) => {
  const url = new URL(origin);
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    protocol: url.protocol
  };
});

// src/policy-proxy.js
import dns from "node:dns";
import http from "node:http";
import net from "node:net";
var ALWAYS_DENIED_V4 = new net.BlockList();
var ALWAYS_DENIED_V6 = new net.BlockList();
var PRIVATE_V4 = new net.BlockList();
var PRIVATE_V6 = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["100.64.0.0", 10],
  ["169.254.0.0", 16],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
]) ALWAYS_DENIED_V4.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["::ffff:0:0", 96]
]) ALWAYS_DENIED_V6.addSubnet(network, prefix, "ipv6");
for (const [network, prefix] of [
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16]
]) PRIVATE_V4.addSubnet(network, prefix, "ipv4");
PRIVATE_V6.addAddress("::1", "ipv6");
var normalizeHost = (host) => String(host || "").replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
var familyOf = (address) => net.isIP(address) === 6 ? "ipv6" : "ipv4";
var permanentlyDenied = (address) => {
  const family = familyOf(address);
  if (!net.isIP(address)) return "DNS returned an invalid address";
  const denied = family === "ipv6" ? ALWAYS_DENIED_V6.check(address, family) : ALWAYS_DENIED_V4.check(address, family);
  if (!denied) return null;
  if (family === "ipv6" && address.toLowerCase().startsWith("::ffff:")) {
    return "IPv4-mapped addresses are denied";
  }
  if (family === "ipv4" && address.startsWith("169.254.")) return "IPv4 link-local addresses are denied";
  return "Unspecified, link-local, transition, multicast, CGNAT, or reserved addresses are denied";
};
var grantProtocol = (protocol) => protocol === "ws:" ? "http:" : protocol === "wss:" ? "https:" : protocol;
var hasGrant = (grants, hostname, address, port, protocol) => grants.some((grant) => grant.port === port && (!grant.protocol || grant.protocol === grantProtocol(protocol)) && (normalizeHost(grant.host) === hostname || normalizeHost(grant.host) === address));
var classifyProxyTarget = async (target, { grants = [], lookup = dns.promises.lookup } = {}) => {
  let url;
  try {
    url = target instanceof URL ? new URL(target) : new URL(String(target));
  } catch {
    return { allowed: false, reason: "Invalid proxy target" };
  }
  if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
    return { allowed: false, reason: "Unsupported proxy target protocol" };
  }
  const hostname = normalizeHost(url.hostname);
  const port = Number(url.port || (url.protocol === "https:" || url.protocol === "wss:" ? 443 : 80));
  if (!hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { allowed: false, reason: "Invalid proxy target authority" };
  }
  if (hostname === "metadata.google.internal") {
    return { allowed: false, reason: "Cloud metadata host is denied" };
  }
  let answers;
  if (hostname === "localhost" && hasGrant(grants, hostname, "127.0.0.1", port, url.protocol)) {
    answers = [{ address: "127.0.0.1", family: 4 }];
  } else if (net.isIP(hostname)) {
    answers = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    try {
      answers = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      return { allowed: false, reason: "DNS resolution failed" };
    }
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    return { allowed: false, reason: "DNS returned no addresses" };
  }
  for (const answer of answers) {
    const address = normalizeHost(answer?.address);
    const reason = permanentlyDenied(address);
    if (reason) return { allowed: false, reason };
    const family = familyOf(address);
    const privateAddress = family === "ipv6" ? PRIVATE_V6.check(address, family) : PRIVATE_V4.check(address, family);
    if (privateAddress && !hasGrant(grants, hostname, address, port, url.protocol)) {
      return { allowed: false, reason: "Private or loopback address requires an allowed origin" };
    }
  }
  const pinned = answers[0];
  return {
    allowed: true,
    address: normalizeHost(pinned.address),
    family: Number(pinned.family) || net.isIP(pinned.address),
    port,
    url
  };
};
var denyHttp = (response, reason) => {
  response.writeHead(403, { "content-type": "text/plain; charset=utf-8", connection: "close" });
  response.end(`Forbidden: ${reason}
`);
};
var denySocket = (socket, reason, status = "403 Forbidden") => {
  if (socket.destroyed || socket.writableEnded) return;
  socket.end(`HTTP/1.1 ${status}\r
Connection: close\r
Content-Type: text/plain\r
\r
Forbidden: ${reason}
`);
};
var createPolicyProxy = (policy = {}) => {
  const downstreamSockets = /* @__PURE__ */ new Set();
  const upstreamSockets = /* @__PURE__ */ new Set();
  let listening = false;
  let closed = false;
  let closePromise = null;
  const track = (collection, socket) => {
    collection.add(socket);
    socket.once("close", () => collection.delete(socket));
    return socket;
  };
  const server = http.createServer((request, response) => {
    void (async () => {
      let upstream = null;
      let downstreamClosed = request.aborted || response.destroyed;
      const closeDownstream = () => {
        downstreamClosed = true;
        upstream?.destroy();
      };
      request.once("aborted", closeDownstream);
      response.once("close", closeDownstream);
      const decision = await classifyProxyTarget(request.url, policy);
      await new Promise((resolve) => setImmediate(resolve));
      if (downstreamClosed || response.writableEnded) return;
      if (closed) return denyHttp(response, "Browser proxy is closed");
      if (!decision.allowed) return denyHttp(response, decision.reason);
      if (decision.url.protocol !== "http:") return denyHttp(response, "Plain proxy requests must use HTTP");
      const headers = { ...request.headers, host: decision.url.host };
      delete headers["proxy-connection"];
      upstream = http.request({
        hostname: decision.address,
        family: decision.family,
        port: decision.port,
        method: request.method,
        path: `${decision.url.pathname}${decision.url.search}`,
        headers,
        agent: false
      }, (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      });
      upstream.on("socket", (socket) => track(upstreamSockets, socket));
      upstream.on("error", () => {
        if (!response.headersSent) response.writeHead(502, { connection: "close" });
        response.end();
      });
      request.pipe(upstream);
    })().catch(() => denyHttp(response, "Proxy classification failed"));
  });
  server.on("connection", (socket) => track(downstreamSockets, socket));
  server.on("connect", (request, client, head) => {
    void (async () => {
      let upstream = null;
      let downstreamClosed = client.destroyed;
      client.once("close", () => {
        downstreamClosed = true;
        upstream?.destroy();
      });
      const decision = await classifyProxyTarget(`https://${request.url}`, policy);
      await new Promise((resolve) => setImmediate(resolve));
      if (downstreamClosed) return;
      if (closed) return client.destroy();
      if (!decision.allowed) return denySocket(client, decision.reason);
      upstream = track(upstreamSockets, net.connect({
        host: decision.address,
        family: decision.family,
        port: decision.port
      }));
      upstream.once("close", () => client.destroy());
      upstream.once("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length > 0) upstream.write(head);
        client.pipe(upstream).pipe(client);
      });
      upstream.once("error", () => denySocket(client, "Upstream connection failed", "502 Bad Gateway"));
    })().catch(() => denySocket(client, "Proxy classification failed"));
  });
  server.on("upgrade", (request, client, head) => {
    void (async () => {
      let upstream = null;
      let downstreamClosed = client.destroyed;
      client.once("close", () => {
        downstreamClosed = true;
        upstream?.destroy();
      });
      const decision = await classifyProxyTarget(request.url, policy);
      await new Promise((resolve) => setImmediate(resolve));
      if (downstreamClosed) return;
      if (closed) return client.destroy();
      if (!decision.allowed) return denySocket(client, decision.reason);
      if (decision.url.protocol !== "ws:") return denySocket(client, "Plain upgrades must use WebSocket");
      upstream = track(upstreamSockets, net.connect({
        host: decision.address,
        family: decision.family,
        port: decision.port
      }));
      upstream.once("close", () => client.destroy());
      upstream.once("connect", () => {
        const lines = [`${request.method} ${decision.url.pathname}${decision.url.search} HTTP/${request.httpVersion}`];
        for (let index = 0; index < request.rawHeaders.length; index += 2) {
          const name = request.rawHeaders[index];
          const value = name.toLowerCase() === "host" ? decision.url.host : request.rawHeaders[index + 1];
          lines.push(`${name}: ${value}`);
        }
        upstream.write(`${lines.join("\r\n")}\r
\r
`);
        if (head.length > 0) upstream.write(head);
        client.pipe(upstream).pipe(client);
      });
      upstream.once("error", () => denySocket(client, "Upstream connection failed", "502 Bad Gateway"));
    })().catch(() => denySocket(client, "Proxy classification failed"));
  });
  return {
    get address() {
      const value = server.address();
      return value && typeof value === "object" ? `127.0.0.1:${value.port}` : null;
    },
    async listen() {
      if (listening) return this.address;
      if (closed) throw new Error("Browser proxy is closed");
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      listening = true;
      return this.address;
    },
    close() {
      if (closePromise) return closePromise;
      closed = true;
      closePromise = new Promise((resolve) => {
        if (listening) server.close(resolve);
        else resolve();
        for (const socket of downstreamSockets) socket.destroy();
        for (const socket of upstreamSockets) socket.destroy();
        listening = false;
      });
      return closePromise;
    }
  };
};

// node_modules/@openchamber/sdk/dist/contract.js
var GUEST_FILE_STAT_KINDS = ["file", "directory", "other", "missing"];
var HOST_REQUEST_ERROR_CODES = [
  "HOST_UNAVAILABLE",
  "HOST_TIMEOUT",
  "HOST_REJECTED",
  "DISCONNECTED",
  "DISABLED",
  "BAD_PATH",
  "NO_INTEGRATION",
  "NO_SERVICE",
  "SERVICE_FAILED",
  "NO_SESSION",
  "SESSION_BUSY",
  "NOT_GRANTED",
  "NO_DIRECTORY",
  "NOT_FOUND",
  "FILE_TOO_LARGE",
  "DENIED",
  "NO_MODEL",
  "MODEL_FAILED"
];
var SERVICE_STATUS_VALUES = ["stopped", "starting", "ready", "failed"];
var hostRequestErrorCodeSet = new Set(HOST_REQUEST_ERROR_CODES);
var serviceStatusSet = new Set(SERVICE_STATUS_VALUES);
var fileStatKindSet = new Set(GUEST_FILE_STAT_KINDS);

// node_modules/@openchamber/sdk/dist/service-providers.js
var BROWSER_PROVIDER_PATH = "/browser-control";
var BROWSER_CONTROL_ACTIONS = [
  "browser.open",
  "browser.snapshot",
  "browser.click",
  "browser.type",
  "browser.scroll",
  "browser.back",
  "browser.forward",
  "browser.inspect",
  "browser.capture",
  "browser.resize"
];
var BROWSER_PROVIDER_IDLE_MS = 10 * 6e4;
var CONTROL_ACTIONS = new Set(BROWSER_CONTROL_ACTIONS);
var isBrowserControlAction = (value) => CONTROL_ACTIONS.has(value);
var readBrowserProviderRequest = (body) => {
  let wire;
  try {
    const parsed = JSON.parse(body);
    if (Object(parsed) !== parsed || parsed === null)
      return null;
    wire = parsed;
  } catch {
    return null;
  }
  const { requestId, action, parameters } = wire;
  if (String(requestId) !== requestId || requestId.length === 0)
    return null;
  if (String(action) !== action || !isBrowserControlAction(action))
    return null;
  if (Object(parameters) !== parameters)
    return null;
  return { requestId, action, parameters };
};

// node_modules/@openchamber/sdk/dist/service-surface.js
var SURFACE_FRAME_PATH = "/surface/frame";
var SURFACE_INPUT_PATH = "/surface/input";
var SURFACE_CONTROL_PATH = "/surface/control";
var SURFACE_RESIZE_PATH = "/surface/resize";
var SURFACE_CLIPBOARD_PATH = "/surface/clipboard";
var SURFACE_SEQ_HEADER = "x-surface-seq";
var SURFACE_WIDTH_HEADER = "x-surface-width";
var SURFACE_HEIGHT_HEADER = "x-surface-height";
var SURFACE_TITLE_HEADER = "x-surface-title";
var SURFACE_AGENT_ACTIVE_HEADER = "x-surface-agent-active";
var SURFACE_FRAME_WAIT_MS = 25e3;
var SURFACE_FRAME_MAX_BYTES = 8e6;
var SURFACE_INPUT_BATCH_MAX = 256;
var SURFACE_TEXT_MAX = 64e3;
var SURFACE_TITLE_MAX = 200;
var SURFACE_DIMENSION_MAX = 16384;
var SURFACE_CONTROLLERS = ["none", "agent", "user"];
var isFiniteNumber = (value) => Number(value) === value && Number.isFinite(value);
var isBool = (value) => value === true || value === false;
var isText = (value) => String(value) === value;
var readModifiers = (value) => {
  if (Object(value) !== value || value === null)
    return null;
  const wire = value;
  if (!isBool(wire.alt) || !isBool(wire.ctrl) || !isBool(wire.meta) || !isBool(wire.shift))
    return null;
  return { alt: wire.alt, ctrl: wire.ctrl, meta: wire.meta, shift: wire.shift };
};
var readEvent = (value) => {
  if (value.type === "text") {
    if (!isText(value.text) || value.text.length > SURFACE_TEXT_MAX)
      return null;
    return { type: "text", text: value.text };
  }
  const modifiers = readModifiers(value.modifiers);
  if (!modifiers)
    return null;
  if (value.type === "pointer") {
    if (value.action !== "down" && value.action !== "up" && value.action !== "move")
      return null;
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.button) || !isFiniteNumber(value.buttons))
      return null;
    return { type: "pointer", action: value.action, x: value.x, y: value.y, button: value.button, buttons: value.buttons, modifiers };
  }
  if (value.type === "wheel") {
    if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.deltaX) || !isFiniteNumber(value.deltaY))
      return null;
    return { type: "wheel", x: value.x, y: value.y, deltaX: value.deltaX, deltaY: value.deltaY, modifiers };
  }
  if (value.type === "key") {
    if (value.action !== "down" && value.action !== "up")
      return null;
    if (!isText(value.key) || !isText(value.code) || value.key.length > 64 || value.code.length > 64)
      return null;
    return { type: "key", action: value.action, key: value.key, code: value.code, modifiers };
  }
  return null;
};
var readSurfaceInputBatch = (body) => {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (Object(parsed) !== parsed || parsed === null || !Array.isArray(parsed.events))
    return null;
  if (parsed.events.length > SURFACE_INPUT_BATCH_MAX)
    return null;
  const events = [];
  for (const item of parsed.events) {
    if (Object(item) !== item || item === null)
      return null;
    const event = readEvent(item);
    if (!event)
      return null;
    events.push(event);
  }
  return { events };
};
var CONTROLLERS = new Set(SURFACE_CONTROLLERS);
var readSurfaceControlNotice = (body) => {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (Object(parsed) !== parsed || parsed === null)
    return null;
  const { controller } = parsed;
  if (!isText(controller) || !CONTROLLERS.has(controller))
    return null;
  return { controller };
};
var readSurfaceResizeRequest = (body) => {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (Object(parsed) !== parsed || parsed === null)
    return null;
  const { width, height } = parsed;
  if (!isFiniteNumber(width) || !isFiniteNumber(height))
    return null;
  if (width < 1 || height < 1 || width > SURFACE_DIMENSION_MAX || height > SURFACE_DIMENSION_MAX)
    return null;
  return { width: Math.round(width), height: Math.round(height) };
};

// src/surface.js
var BUTTON_NAMES = ["left", "middle", "right"];
var KEY_CODES = Object.freeze({ Backspace: 8, Tab: 9, Enter: 13, Escape: 27, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46 });
var modifiersMask = (modifiers) => (modifiers.alt ? 1 : 0) | (modifiers.ctrl ? 2 : 0) | (modifiers.meta ? 4 : 0) | (modifiers.shift ? 8 : 0);
var mouseButton = (button) => BUTTON_NAMES[button] ?? "none";
var dispatchInput = async (page, event) => {
  if (event.type === "text") {
    await page.cdp.sendSession(page.sessionId, "Input.insertText", { text: event.text });
    return;
  }
  if (event.type === "pointer") {
    const types = { down: "mousePressed", up: "mouseReleased", move: "mouseMoved" };
    await page.cdp.sendSession(page.sessionId, "Input.dispatchMouseEvent", {
      type: types[event.action],
      x: event.x,
      y: event.y,
      button: mouseButton(event.button),
      buttons: event.buttons,
      clickCount: event.action === "move" ? 0 : 1,
      modifiers: modifiersMask(event.modifiers)
    });
    return;
  }
  if (event.type === "wheel") {
    await page.cdp.sendSession(page.sessionId, "Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: event.x,
      y: event.y,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      modifiers: modifiersMask(event.modifiers)
    });
    return;
  }
  const keyCode = KEY_CODES[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase().charCodeAt(0) : 0);
  const printable = event.action === "down" && event.key.length === 1 && !event.modifiers.alt && !event.modifiers.ctrl && !event.modifiers.meta;
  await page.cdp.sendSession(page.sessionId, "Input.dispatchKeyEvent", {
    type: event.action === "down" ? "keyDown" : "keyUp",
    key: event.key,
    code: event.code,
    modifiers: modifiersMask(event.modifiers),
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    ...printable ? { text: event.key, unmodifiedText: event.key } : {}
  });
};
var clipboardExpression = `(() => {
  var active = document.activeElement;
  if (active && typeof active.value === 'string' && typeof active.selectionStart === 'number') {
    return active.value.slice(active.selectionStart, active.selectionEnd);
  }
  return String(window.getSelection ? window.getSelection() : '');
})()`;
var createSurface = (runtime) => {
  const waiters = /* @__PURE__ */ new Set();
  let page = null;
  let unsubscribe = null;
  let latest = null;
  let sequence = 0;
  let closed = false;
  let startPromise = null;
  const finishWaiter = (waiter, value) => {
    if (!waiters.delete(waiter)) return;
    clearTimeout(waiter.timer);
    waiter.signal?.removeEventListener("abort", waiter.onAbort);
    waiter.resolve(value);
  };
  const publish = (frame) => {
    latest = frame;
    for (const waiter of waiters) {
      if (frame.sequence > waiter.after) finishWaiter(waiter, frame);
    }
  };
  const startSurface = async () => {
    const current = await runtime.ensurePage();
    if (closed) throw new Error("Surface is closed");
    if (page?.sessionId === current.sessionId && unsubscribe) return current;
    unsubscribe?.();
    page = current;
    unsubscribe = page.cdp.onEvent((event) => {
      if (event.sessionId !== page.sessionId || event.method !== "Page.screencastFrame") return;
      void page.cdp.sendSession(page.sessionId, "Page.screencastFrameAck", {
        sessionId: event.params.sessionId
      }).catch(() => {
      });
      const bytes = Buffer.from(String(event.params.data ?? ""), "base64");
      if (bytes.length === 0 || bytes.length > SURFACE_FRAME_MAX_BYTES) return;
      sequence += 1;
      publish({
        sequence,
        bytes,
        mime: "image/jpeg",
        width: Math.round(event.params.metadata?.deviceWidth ?? runtime.viewport?.width ?? 0),
        height: Math.round(event.params.metadata?.deviceHeight ?? runtime.viewport?.height ?? 0),
        title: runtime.title
      });
    });
    await page.cdp.sendSession(page.sessionId, "Page.startScreencast", {
      format: "jpeg",
      quality: 72,
      everyNthFrame: 1
    });
    if (closed) {
      await page.cdp.sendSession(page.sessionId, "Page.stopScreencast").catch(() => {
      });
      throw new Error("Surface is closed");
    }
    return page;
  };
  const start = () => {
    if (closed) return Promise.reject(new Error("Surface is closed"));
    if (!startPromise) startPromise = startSurface().catch((error) => {
      unsubscribe?.();
      unsubscribe = null;
      page = null;
      throw error;
    }).finally(() => {
      startPromise = null;
    });
    return startPromise;
  };
  return {
    async frame({ after, wait: wait2, signal }) {
      if (closed) return null;
      signal?.throwIfAborted();
      await start();
      signal?.throwIfAborted();
      if (latest && latest.sequence > after) return latest;
      if (wait2 === 0) return null;
      return new Promise((resolve, reject) => {
        const waiter = { after, signal, resolve, reject, timer: null, onAbort: null };
        waiter.onAbort = () => {
          if (!waiters.delete(waiter)) return;
          clearTimeout(waiter.timer);
          reject(signal.reason ?? new DOMException("Frame request cancelled", "AbortError"));
        };
        waiter.timer = setTimeout(() => finishWaiter(waiter, null), wait2);
        waiter.timer.unref?.();
        signal?.addEventListener("abort", waiter.onAbort, { once: true });
        waiters.add(waiter);
      });
    },
    async input(events) {
      const current = await start();
      for (const event of events) await dispatchInput(current, event);
    },
    control(controller) {
      runtime.controller = controller;
    },
    async resize({ width, height }) {
      await runtime.ensurePage();
      await runtime.setViewport({ width, height, mobile: false });
      return { width, height };
    },
    async clipboard() {
      const current = await start();
      const response = await current.cdp.sendSession(current.sessionId, "Runtime.evaluate", {
        expression: clipboardExpression,
        returnByValue: true
      });
      return typeof response.result?.value === "string" ? response.result.value : "";
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const waiter of waiters) finishWaiter(waiter, null);
      await startPromise?.catch(() => {
      });
      unsubscribe?.();
      unsubscribe = null;
      if (page?.cdp.isOpen) {
        await page.cdp.sendSession(page.sessionId, "Page.stopScreencast").catch(() => {
        });
      }
      page = null;
    }
  };
};

// src/browser-runtime.js
var boundedText = (value, maximum = 1e3) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maximum);
var createBrowserRuntime = ({ chromePath = null, allowedOrigins = [] } = {}) => {
  const chrome = createChromeProcess({ chromePath });
  const proxy = createPolicyProxy({ grants: originGrants(allowedOrigins) });
  const shutdownController = new AbortController();
  const problems = [];
  let cdp = null;
  let contextId = null;
  let targetId = null;
  let sessionId = null;
  let eventCleanup = null;
  let startupPromise = null;
  let pagePromise = null;
  let actionQueue = Promise.resolve();
  let closed = false;
  const runtime = {
    viewport: viewportForMode("desktop"),
    controller: "none",
    agentActive: false,
    title: "",
    get consoleProblems() {
      return problems.map((problem) => ({ ...problem }));
    },
    clearConsoleProblems() {
      problems.length = 0;
    }
  };
  const addProblem = (problem) => {
    if (!problem.message) return;
    problems.push(problem);
    if (problems.length > 50) problems.shift();
  };
  const observeCdp = () => cdp.onEvent((event) => {
    if (event.sessionId !== sessionId) return;
    if (event.method === "Runtime.consoleAPICalled") {
      if (event.params.type !== "warning" && event.params.type !== "error") return;
      const message = event.params.args?.map((arg) => arg.value ?? arg.description).filter(Boolean).join(" ");
      addProblem({ level: event.params.type, message: boundedText(message), source: "console" });
    }
    if (event.method === "Log.entryAdded") {
      const entry = event.params.entry;
      if (entry?.level !== "warning" && entry?.level !== "error") return;
      addProblem({ level: entry.level, message: boundedText(entry.text), source: boundedText(entry.source || "log", 120) });
    }
  });
  const start = async () => {
    let nextCdp = null;
    let nextContextId = null;
    try {
      const [proxyAddress, processInfo] = await Promise.all([proxy.listen(), chrome.ensure()]);
      if (closed) throw new Error("Browser runtime is closed");
      nextCdp = await connectCdp(processInfo.endpoint);
      const context = await nextCdp.send("Target.createBrowserContext", {
        proxyServer: proxyAddress,
        proxyBypassList: "<-loopback>"
      });
      if (typeof context.browserContextId !== "string") throw new Error("Chrome returned no browser context id");
      nextContextId = context.browserContextId;
      if (closed) throw new Error("Browser runtime is closed");
      cdp = nextCdp;
      contextId = nextContextId;
    } catch (error) {
      if (nextContextId && nextCdp?.isOpen) {
        await nextCdp.send("Target.disposeBrowserContext", { browserContextId: nextContextId }).catch(() => {
        });
      }
      nextCdp?.close();
      throw error;
    }
  };
  const ensureStarted = async () => {
    if (closed) throw new Error("Browser runtime is closed");
    if (cdp?.isOpen && contextId) return;
    if (!startupPromise) startupPromise = start().catch((error) => {
      startupPromise = null;
      throw error;
    });
    await startupPromise;
  };
  const createPage = async () => {
    await ensureStarted();
    if (targetId && sessionId) return { cdp, contextId, targetId, sessionId };
    if (closed) throw new Error("Browser runtime is closed");
    const target = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId: contextId });
    if (typeof target.targetId !== "string") throw new Error("Chrome returned no page target id");
    const nextTargetId = target.targetId;
    const nextSessionId = await cdp.attach(nextTargetId);
    if (closed) throw new Error("Browser runtime is closed");
    targetId = nextTargetId;
    sessionId = nextSessionId;
    eventCleanup = observeCdp();
    await Promise.all([
      cdp.sendSession(sessionId, "Page.enable"),
      cdp.sendSession(sessionId, "Runtime.enable"),
      cdp.sendSession(sessionId, "Log.enable")
    ]);
    await applyViewport(cdp, sessionId, runtime.viewport);
    return { cdp, contextId, targetId, sessionId };
  };
  runtime.ensurePage = async () => {
    if (targetId && sessionId) return { cdp, contextId, targetId, sessionId };
    if (!pagePromise) pagePromise = createPage().catch((error) => {
      targetId = null;
      sessionId = null;
      throw error;
    }).finally(() => {
      pagePromise = null;
    });
    return pagePromise;
  };
  runtime.setViewport = async (viewport) => {
    const page = await runtime.ensurePage();
    await applyViewport(page.cdp, page.sessionId, viewport);
    runtime.viewport = viewport;
  };
  const execute = createBrowserActions(runtime);
  const surface = createSurface(runtime);
  runtime.perform = (action, parameters, callerSignal) => {
    if (closed) return Promise.reject(new Error("Browser runtime is closed"));
    if (runtime.controller === "user") {
      return Promise.reject(new Error("The user controls the browser. Wait for them to hand control back."));
    }
    const signal = callerSignal ? AbortSignal.any([callerSignal, shutdownController.signal]) : shutdownController.signal;
    const operation = actionQueue.catch(() => {
    }).then(async () => {
      signal.throwIfAborted();
      if (runtime.controller === "user") {
        throw new Error("The user controls the browser. Wait for them to hand control back.");
      }
      runtime.agentActive = true;
      try {
        const data = await execute(action, parameters, signal);
        if (typeof data?.title === "string") runtime.title = data.title;
        return data;
      } finally {
        runtime.agentActive = false;
      }
    });
    actionQueue = operation;
    return operation;
  };
  runtime.surfaceFrame = (request) => surface.frame(request);
  runtime.surfaceInput = (events) => surface.input(events);
  runtime.surfaceControl = (controller) => surface.control(controller);
  runtime.surfaceResize = (size) => surface.resize(size);
  runtime.surfaceClipboard = () => surface.clipboard();
  runtime.close = async () => {
    if (closed) return;
    closed = true;
    shutdownController.abort(new DOMException("Browser runtime stopped", "AbortError"));
    await surface.close();
    await pagePromise?.catch(() => {
    });
    await actionQueue.catch(() => {
    });
    eventCleanup?.();
    if (contextId && cdp?.isOpen) {
      await cdp.send("Target.disposeBrowserContext", { browserContextId: contextId }).catch(() => {
      });
    }
    cdp?.close();
    await proxy.close();
    await chrome.close();
    contextId = null;
    targetId = null;
    sessionId = null;
  };
  return runtime;
};

// src/service.js
import crypto from "node:crypto";
import http2 from "node:http";
var BODY_MAX_BYTES = 17 * 1024 * 1024;
var json = (response, status, body) => {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": bytes.length
  });
  response.end(bytes);
};
var text = (response, status, body) => {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
};
var authorized = (request, token) => {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
};
var readBody = async (request) => {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > BODY_MAX_BYTES) throw new Error("Request body is too large");
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > BODY_MAX_BYTES) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length).toString("utf8");
};
var queryInteger = (url, name, fallback, maximum) => {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= maximum ? value : null;
};
var errorMessage = (error) => {
  if (error instanceof DOMException && error.name === "AbortError") return "Browser action was cancelled";
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unknown browser state";
};
var surfaceTitleHeader = (value) => Array.from(String(value ?? ""), (character) => {
  const codePoint = character.codePointAt(0);
  if (codePoint <= 31 || codePoint >= 127 && codePoint <= 159) return " ";
  if (codePoint > 255) return "?";
  return character;
}).join("").trim().slice(0, SURFACE_TITLE_MAX);
var createService = ({ runtime, token, port = 0 }) => {
  if (!runtime?.perform || !runtime?.close) throw new Error("createService requires a browser runtime");
  if (typeof token !== "string" || token.length === 0) throw new Error("createService requires a bearer token");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Service port must be from 0 to 65535");
  const activeRequests = /* @__PURE__ */ new Set();
  let listening = false;
  let closePromise = null;
  const handle = async (request, response, signal) => {
    if (!authorized(request, token)) return text(response, 401, "Unauthorized\n");
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ok: true });
    if (request.method === "POST" && url.pathname === BROWSER_PROVIDER_PATH) {
      const parsed = readBrowserProviderRequest(await readBody(request));
      if (!parsed) return text(response, 400, "Invalid browser provider request\n");
      try {
        const data = await runtime.perform(parsed.action, parsed.parameters, signal);
        return json(response, 200, { ok: true, data });
      } catch (error) {
        return json(response, 200, { ok: false, error: errorMessage(error) });
      }
    }
    if (request.method === "GET" && url.pathname === SURFACE_FRAME_PATH) {
      const after = queryInteger(url, "after", 0, Number.MAX_SAFE_INTEGER);
      const wait2 = queryInteger(url, "wait", 0, SURFACE_FRAME_WAIT_MS);
      if (after === null || wait2 === null) return text(response, 400, "Invalid frame query\n");
      const frame = await runtime.surfaceFrame({ after, wait: wait2, signal });
      if (!frame) {
        response.writeHead(204);
        return response.end();
      }
      const headers = {
        "content-type": frame.mime,
        "content-length": frame.bytes.length,
        [SURFACE_SEQ_HEADER]: String(frame.sequence),
        [SURFACE_WIDTH_HEADER]: String(frame.width),
        [SURFACE_HEIGHT_HEADER]: String(frame.height)
      };
      const title = surfaceTitleHeader(frame.title);
      if (title) headers[SURFACE_TITLE_HEADER] = title;
      if (runtime.agentActive) headers[SURFACE_AGENT_ACTIVE_HEADER] = "1";
      response.writeHead(200, headers);
      return response.end(frame.bytes);
    }
    if (request.method === "POST" && url.pathname === SURFACE_INPUT_PATH) {
      const parsed = readSurfaceInputBatch(await readBody(request));
      if (!parsed) return text(response, 400, "Invalid surface input batch\n");
      await runtime.surfaceInput(parsed.events);
      response.writeHead(204);
      return response.end();
    }
    if (request.method === "POST" && url.pathname === SURFACE_CONTROL_PATH) {
      const parsed = readSurfaceControlNotice(await readBody(request));
      if (!parsed) return text(response, 400, "Invalid surface control notice\n");
      await runtime.surfaceControl(parsed.controller);
      response.writeHead(204);
      return response.end();
    }
    if (request.method === "POST" && url.pathname === SURFACE_RESIZE_PATH) {
      const parsed = readSurfaceResizeRequest(await readBody(request));
      if (!parsed) return text(response, 400, "Invalid surface resize request\n");
      return json(response, 200, await runtime.surfaceResize(parsed));
    }
    if (request.method === "GET" && url.pathname === SURFACE_CLIPBOARD_PATH) {
      return json(response, 200, { text: await runtime.surfaceClipboard() });
    }
    return text(response, 404, "Not found\n");
  };
  const server = http2.createServer((request, response) => {
    const controller = new AbortController();
    activeRequests.add(controller);
    request.once("aborted", () => controller.abort(new DOMException("Request aborted", "AbortError")));
    response.once("close", () => {
      activeRequests.delete(controller);
      if (!response.writableEnded) controller.abort(new DOMException("Client disconnected", "AbortError"));
    });
    void handle(request, response, controller.signal).catch((error) => {
      activeRequests.delete(controller);
      if (!response.headersSent) json(response, 500, { ok: false, error: errorMessage(error) });
      else response.destroy();
    });
  });
  return {
    async listen() {
      if (listening) return this.address;
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
      listening = true;
      return this.address;
    },
    get address() {
      const value = server.address();
      return value && typeof value === "object" ? { host: "127.0.0.1", port: value.port } : null;
    },
    close() {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        for (const controller of activeRequests) {
          controller.abort(new DOMException("Service stopped", "AbortError"));
        }
        await runtime.close();
        if (listening) {
          const closed = new Promise((resolve) => server.close(resolve));
          server.closeAllConnections?.();
          await closed;
        }
        listening = false;
      })();
      return closePromise;
    }
  };
};

// src/main.js
var readPort = (value) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("OPENCHAMBER_SERVICE_PORT must be an integer from 1 to 65535");
  }
  return port;
};
var startService = async ({
  env = process.env,
  configPath,
  runtime
} = {}) => {
  const token = env.OPENCHAMBER_SERVICE_TOKEN;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("OPENCHAMBER_SERVICE_TOKEN is required");
  }
  const config = loadConfig({ entryUrl: import.meta.url, configPath });
  const browserRuntime = runtime ?? createBrowserRuntime(config);
  const service = createService({
    runtime: browserRuntime,
    token,
    port: readPort(env.OPENCHAMBER_SERVICE_PORT)
  });
  await service.listen();
  return service;
};
var isMain = process.argv[1] && path3.resolve(process.argv[1]) === fileURLToPath2(import.meta.url);
if (isMain) {
  startService().then((service) => {
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      void service.close().finally(() => process.exit(0));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
export {
  createBrowserRuntime,
  createService,
  startService
};
