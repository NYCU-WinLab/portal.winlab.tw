// The only place chameleon-ultra.js is touched. The library ships no types and
// must never enter the app bundle: it is a browser-only Web Serial driver we
// load from a CDN at runtime, lazily. Both bundlers are told to leave the URLs
// alone so the import stays a native runtime import. Its shape is asserted only
// at the two import boundaries below (loadCore and loadAdapter), and nowhere
// else in the app sees an untyped value.

const CHAMELEON_CORE_ESM =
  "https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm"
const CHAMELEON_ADAPTER_ESM =
  "https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/plugin/WebserialAdapter/+esm"

// The scan result we care about: a tag's raw UID. The library returns a Buffer,
// which is a Uint8Array, so this is enough to hand to uidToCardNumber.
export type Iso14443aTag = { uid: Uint8Array }

// A live reader, ready to poll. disconnect puts the device back in a safe mode
// and releases the serial port.
export interface CardReaderConnection {
  scan(): Promise<Iso14443aTag[]>
  disconnect(): Promise<void>
}

type DeviceModeEnum = { READER: number; TAG: number }

interface UltraDevice {
  use(adapter: unknown): void
  cmdChangeDeviceMode(mode: number): Promise<void>
  cmdHf14aScan(): Promise<Iso14443aTag[] | Iso14443aTag>
  disconnect?(): Promise<void>
}

interface ChameleonCoreModule {
  ChameleonUltra: new () => UltraDevice
  DeviceMode: DeviceModeEnum
}

interface WebserialAdapterModule {
  default: new () => unknown
}

async function loadCore(): Promise<ChameleonCoreModule> {
  // The single cast for the core module. import() of a runtime URL is typed
  // any, so it is narrowed through unknown to the shape used above.
  return (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ CHAMELEON_CORE_ESM
  )) as unknown as ChameleonCoreModule
}

async function loadAdapter(): Promise<WebserialAdapterModule> {
  // The single cast for the adapter module, same reasoning as loadCore.
  return (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ CHAMELEON_ADAPTER_ESM
  )) as unknown as WebserialAdapterModule
}

// Warm the module cache before the user clicks connect. requestPort() only
// runs during a live user gesture (~5s of transient activation), so a cold CDN
// fetch inside the click handler could blow that window and throw. Firing the
// imports ahead of time makes connectCardReader() resolve them from cache and
// reach requestPort() while the gesture is still active. Fire-and-forget: the
// dynamic imports memoize, so a failure here is retried by connectCardReader().
export function preloadCardReader(): void {
  void loadCore().catch(() => {})
  void loadAdapter().catch(() => {})
}

// Must run inside a user gesture: the WebserialAdapter triggers
// navigator.serial.requestPort(), which the browser only allows while the click
// that started this call is still the active user activation.
export async function connectCardReader(): Promise<CardReaderConnection> {
  const { ChameleonUltra, DeviceMode } = await loadCore()
  const { default: WebserialAdapter } = await loadAdapter()

  const ultra = new ChameleonUltra()
  ultra.use(new WebserialAdapter())
  await ultra.cmdChangeDeviceMode(DeviceMode.READER)

  return {
    async scan() {
      const tags = await ultra.cmdHf14aScan()
      return Array.isArray(tags) ? tags : [tags]
    },
    async disconnect() {
      // Leaving the device in tag-emulation mode is the safe resting state; if
      // it refuses, closing the port still matters more, so swallow it.
      try {
        await ultra.cmdChangeDeviceMode(DeviceMode.TAG)
      } catch {
        // ignore, the disconnect below is what frees the port
      }
      if (typeof ultra.disconnect === "function") await ultra.disconnect()
    },
  }
}
