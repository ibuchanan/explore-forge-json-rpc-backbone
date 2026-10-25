// Generated from docs/reference/openrpc.json by Ajv; do not edit.
// Regenerate: bun run generate:commands
var P = (e, o) => () => (o || e((o = { exports: {} }).exports, o), o.exports);
var x = P(function (m) {
  Object.defineProperty(m, "__esModule", { value: !0 });
  function h(e) {
    let o = e.length,
      b = 0,
      f = 0,
      u;
    while (f < o)
      if ((b++, (u = e.charCodeAt(f++)), u >= 55296 && u <= 56319 && f < o)) {
        if (((u = e.charCodeAt(f)), (u & 64512) === 56320)) f++;
      }
    return b;
  }
  m.default = h;
  h.code = 'require("ajv/dist/runtime/ucs2length").default';
});
var k = d;
var i = Object.prototype.hasOwnProperty;
function d(
  e,
  {
    instancePath: o = "",
    parentData: b,
    parentDataProperty: f,
    rootData: u = e,
  } = {},
) {
  let p = null,
    r = 0,
    n = r;
  if (r === n)
    if (e && typeof e == "object" && !Array.isArray(e)) {
      let l;
      if (
        ((e.configured === void 0 || !i.call(e, "configured")) &&
          (l = "configured")) ||
        ((e.prefix === void 0 || !i.call(e, "prefix")) && (l = "prefix"))
      )
        return ((d.errors = [{}]), !1);
      else {
        let t = r;
        for (let c of Object.keys(e))
          if (!(c === "configured" || c === "prefix")) {
            return ((d.errors = [{}]), !1);
            break;
          }
        if (t === r) {
          if (e.configured !== void 0 && i.call(e, "configured")) {
            let c = r;
            if (typeof e.configured !== "boolean")
              return ((d.errors = [{}]), !1);
            var s = c === r;
          } else var s = !0;
          if (s)
            if (e.prefix !== void 0 && i.call(e, "prefix")) {
              let c = e.prefix,
                j = r;
              if (typeof c !== "string" && c !== null)
                return ((d.errors = [{}]), !1);
              var s = j === r;
            } else var s = !0;
        }
      }
    } else return ((d.errors = [{}]), !1);
  var a = n === r;
  return a;
}
var D = g;
function g(
  e,
  {
    instancePath: o = "",
    parentData: b,
    parentDataProperty: f,
    rootData: u = e,
  } = {},
) {
  let p = null,
    r = 0,
    n = r;
  if (r === n)
    if (e && typeof e == "object" && !Array.isArray(e)) {
      let a;
      if (
        (e.configured === void 0 || !i.call(e, "configured")) &&
        (a = "configured")
      )
        return ((g.errors = [{}]), !1);
      else {
        let l = r;
        for (let t of Object.keys(e))
          if (t !== "configured") {
            return ((g.errors = [{}]), !1);
            break;
          }
        if (l === r) {
          if (e.configured !== void 0 && i.call(e, "configured")) {
            let t = e.configured;
            if (typeof t !== "boolean") return ((g.errors = [{}]), !1);
            if (t !== !0) return ((g.errors = [{}]), !1);
          }
        }
      }
    } else return ((g.errors = [{}]), !1);
  var s = n === r;
  return s;
}
var A = y;
var O = x().default;
function y(
  e,
  {
    instancePath: o = "",
    parentData: b,
    parentDataProperty: f,
    rootData: u = e,
  } = {},
) {
  let p = null,
    r = 0,
    n = r;
  if (r === n)
    if (e && typeof e == "object" && !Array.isArray(e)) {
      let a;
      if ((e.output === void 0 || !i.call(e, "output")) && (a = "output"))
        return ((y.errors = [{}]), !1);
      else {
        let l = r;
        for (let t of Object.keys(e))
          if (t !== "output") {
            return ((y.errors = [{}]), !1);
            break;
          }
        if (l === r) {
          if (e.output !== void 0 && i.call(e, "output")) {
            let t = e.output;
            if (r === r)
              if (typeof t === "string") {
                if (O(t) > 2064) return ((y.errors = [{}]), !1);
              } else return ((y.errors = [{}]), !1);
          }
        }
      }
    } else return ((y.errors = [{}]), !1);
  var s = n === r;
  return s;
}
var q = v;
function v(
  e,
  {
    instancePath: o = "",
    parentData: b,
    parentDataProperty: f,
    rootData: u = e,
  } = {},
) {
  let p = null,
    r = 0,
    n = r;
  if (r === n)
    if (e && typeof e == "object" && !Array.isArray(e)) {
      let a;
      if (
        (e.configured === void 0 || !i.call(e, "configured")) &&
        (a = "configured")
      )
        return ((v.errors = [{}]), !1);
      else {
        let l = r;
        for (let t of Object.keys(e))
          if (t !== "configured") {
            return ((v.errors = [{}]), !1);
            break;
          }
        if (l === r) {
          if (e.configured !== void 0 && i.call(e, "configured")) {
            let t = e.configured;
            if (typeof t !== "boolean") return ((v.errors = [{}]), !1);
            if (t !== !1) return ((v.errors = [{}]), !1);
          }
        }
      }
    } else return ((v.errors = [{}]), !1);
  var s = n === r;
  return s;
}
var C = {
    "config.get": k,
    "config.set": D,
    "integration.preview": A,
    "config.reset": q,
  },
  L = (e, o) => C[e](o);
export {
  k as output0,
  D as output1,
  A as output2,
  q as output3,
  L as validOutput,
};
