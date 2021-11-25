/// <reference path="./winrtrefs.d.ts"/>
/// <reference path="../built/pxtlib.d.ts"/>

type WHID = Windows.Devices.HumanInterfaceDevice.HidDevice;

namespace pxt.winrt {
    export class WinRTPacketIO implements pxt.packetio.PacketIO {
        onDeviceConnectionChanged = (connect: boolean) => { };
        onConnectionChanged = () => { };
        onData = (v: Uint8Array) => { };
        onEvent = (v: Uint8Array) => { };
        onError = (e: Error) => { };
        public dev: Windows.Devices.HumanInterfaceDevice.HidDevice;
        private connecting = false;

        constructor() {
            this.handleInputReport = this.handleInputReport.bind(this);
        }

        disposeAsync(): Promise<void> {
            return Promise.resolve();
        }

        error(msg: string) {
            throw new Error(U.lf("USB/HID error ({0})", msg))
        }

        private setConnecting(v: boolean) {
            this.connecting = v;
            if (this.onConnectionChanged)
                this.onConnectionChanged();
        }

        isConnecting(): boolean {
            return this.connecting;
        }

        isConnected(): boolean {
            return !!this.dev;
        }

        reconnectAsync(): Promise<void> {
            return this.disconnectAsync()
                .then(() => this.initAsync());
        }

        isSwitchingToBootloader() {
            expectingAdd = true;
            if (this.dev) {
                expectingRemove = true;
            }
        }

        disconnectAsync(): Promise<void> {
            if (this.dev) {
                const d = this.dev;
                delete this.dev;
                try {
                    d.close();
                } catch (e) { }
                if (this.onConnectionChanged)
                    this.onConnectionChanged();
            }
            return Promise.resolve();
        }

        sendPacketAsync(pkt: Uint8Array): Promise<void> {
            if (!this.dev) return Promise.resolve();

            const ar: number[] = [0];
            for (let i = 0; i < Math.max(pkt.length, 64); ++i)
                ar.push(pkt[i] || 0);
            const dataWriter = new Windows.Storage.Streams.DataWriter();
            dataWriter.writeBytes(ar);
            const buffer = dataWriter.detachBuffer();
            const report = this.dev.createOutputReport(0);
            report.data = buffer;
            return pxt.winrt.promisify(
                this.dev.sendOutputReportAsync(report)
                    .then(value => {
                        //pxt.debug(`hf2: ${value} bytes written`)
                    }));
        }

        private handleInputReport(e: Windows.Devices.HumanInterfaceDevice.HidInputReportReceivedEventArgs) {
            //pxt.debug(`input report`)
            const dr = Windows.Storage.Streams.DataReader.fromBuffer(e.report.data);
            const values: number[] = [];
            while (dr.unconsumedBufferLength) {
                values.push(dr.readByte());
            }
            if (values.length == 65 && values[0] === 0) {
                values.shift()
            }
            this.onData(new Uint8Array(values));
        }

        initAsync(isRetry: boolean = false): Promise<void> {
            Util.assert(!this.dev, "HID interface not properly reseted");
            const wd = Windows.Devices;
            const whid = wd.HumanInterfaceDevice.HidDevice;
            const rejectDeviceNotFound = () => {
                const err = new Error(U.lf("Device not found"));
                (<any>err).type = "devicenotfound";
                return Promise.reject(err);
            };
            const getDevicesPromise = hidSelectors.reduce((soFar, currentSelector) => {
                // Try all selectors, in order, until some devices are found
                return soFar.then((devices) => {
                    if (devices && devices.length) {
                        return Promise.resolve(devices);
                    }
                    return wd.Enumeration.DeviceInformation.findAllAsync(currentSelector, null);
                });
            }, Promise.resolve<Windows.Devices.Enumeration.DeviceInformationCollection>(null));

            this.setConnecting(true);
            let deviceId: string;
            return getDevicesPromise
                .then((devices) => {
                    if (!devices || !devices[0]) {
                        pxt.debug("no hid device found");
                        return Promise.reject(new Error("no hid device found"));
                    }
                    pxt.debug(`hid enumerate ${devices.length} devices`);
                    const device = devices[0];
                    pxt.debug(`hid connect to ${device.name} (${device.id})`);
                    deviceId = device.id;
                    return whid.fromIdAsync(device.id, Windows.Storage.FileAccessMode.readWrite);
                })
                .then((r: WHID) => {
                    this.dev = r;
                    if (!this.dev) {
                        pxt.debug("can't connect to hid device");
                        let status = Windows.Devices.Enumeration.DeviceAccessInformation.createFromId(deviceId).currentStatus;
                        pxt.reportError("winrt_device", `could not connect to HID device; device status: ${status}`);
                        return Promise.reject(new Error("can't connect to hid device"));
                    }
                    pxt.debug(`hid device version ${this.dev.version}`);
                    this.dev.addEventListener("inputreportreceived", this.handleInputReport);
                    return Promise.resolve();
                })
                .finally(() => {
                    this.setConnecting(false);
                })
                .catch((e) => {
                    if (isRetry) {
                        return rejectDeviceNotFound();
                    }
                    return bootloaderViaBaud(this)
                        .then(() => {
                            return this.initAsync(true);
                        })
                        .catch(() => {
                            return rejectDeviceNotFound();
                        });

                });
        }
    }

    export let packetIO: WinRTPacketIO = undefined;
    export function mkWinRTPacketIOAsync(): Promise<pxt.packetio.PacketIO> {
        pxt.debug(`packetio: mk winrt packetio`)
        packetIO = new WinRTPacketIO();
        return packetIO.initAsync()
            .catch((e) => {
                packetIO = undefined;
                return Promise.reject(e);
            })
            .then(() => packetIO);
    }

    const hidSelectors: string[] = [];
    const watchers: Windows.Devices.Enumeration.DeviceWatcher[] = [];
    let deviceCount: number = 0;
    let expectingAdd: boolean = false;
    let expectingRemove: boolean = false;

    export function initWinrtHid(reconnectAsync: () => Promise<void>, disconnectAsync: () => Promise<void>) {
        const wd = Windows.Devices;
        const wde = Windows.Devices.Enumeration.DeviceInformation;
        const whid = wd.HumanInterfaceDevice.HidDevice;
        if (pxt.appTarget && pxt.appTarget.compile && pxt.appTarget.compile.hidSelectors) {
            pxt.appTarget.compile.hidSelectors.forEach((s) => {
                const sel = whid.getDeviceSelector(parseInt(s.usagePage), parseInt(s.usageId), parseInt(s.vid), parseInt(s.pid));
                if (hidSelectors.indexOf(sel) < 0) {
                    hidSelectors.push(sel);
                }
            });
        }
        hidSelectors.forEach((s) => {
            const watcher = wde.createWatcher(s, null);
            watcher.addEventListener("added", (e: Windows.Devices.Enumeration.DeviceInformation) => {
                pxt.debug(`new hid device detected: ${e.id}`);
                if (expectingAdd) {
                    expectingAdd = false;
                } else {
                    // A new device was plugged in. If it's the first one, then reconnect the UF2 wrapper. Otherwise,
                    // we're already connected to a plugged device, so don't do anything.
                    ++deviceCount
                    if (deviceCount === 1 && reconnectAsync) {
                        reconnectAsync();
                    }
                }
            });
            watcher.addEventListener("removed", (e: Windows.Devices.Enumeration.DeviceInformation) => {
                pxt.debug(`hid device closed: ${e.id}`);
                if (expectingRemove) {
                    expectingRemove = false;
                } else {
                    // A device was unplugged. If there were more than 1 device, we don't know whether the unplugged
                    // one is the one we were connected to. In that case, reconnect the UF2 wrapper. If no more devices
                    // are left, disconnect the existing wrapper while we wait for a new device to be plugged in.
                    --deviceCount
                    if (deviceCount > 0 && reconnectAsync) {
                        reconnectAsync();
                    } else if (deviceCount === 0 && disconnectAsync) {
                        disconnectAsync();
                        packetIO = undefined;
                    }
                }
            });
            watcher.addEventListener("updated", (e: Windows.Devices.Enumeration.DeviceInformation) => {
                // As per MSDN doc, we MUST subscribe to this event, otherwise the watcher doesn't work
            });
            watchers.push(watcher);
        });
        watchers.filter(w => !w.status).forEach((w) => w.start());
    }
}