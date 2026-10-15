// The gate. Loads the seal's WebGL module only where it will run: a pointer-and-keyboard screen
// 960px and wider, no reduced-motion preference, and the seal on the page. Everyone else keeps
// the engraved SVG and never downloads three.js. Hand-written; no framework.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches && matchMedia('(min-width: 960px)').matches && document.getElementById('heroSeal')) {
  import('/seal.js?v=3').catch(function () {});
}
