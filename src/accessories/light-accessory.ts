import convert from 'color-convert';
import { CharacteristicValue, PlatformAccessory } from 'homebridge';
import { FunctionCharacteristic } from '../models/function-characteristic';
import { HubspacePlatform } from '../platform';
import { isNullOrUndefined } from '../utils';
import { HubspaceAccessory } from './hubspace-accessory';

/**
 * Light accessory for Hubspace platform
 */
export class LightAccessory extends HubspaceAccessory {
    /**
     * Color information for lights that support RGB
     */
    private readonly _lightColor: {
        hue?: number;
        saturation?: number;
    } = {};

    /**
     * Crates a new instance of the accessory
     * @param platform Hubspace platform
     * @param accessory Platform accessory
     */
    constructor(platform: HubspacePlatform, accessory: PlatformAccessory) {
        super(platform, accessory, platform.Service.Lightbulb);

        this.configurePower();
        this.configureBrightness();
        this.configureColorRgb();
        this.configureColorTemperature();
    }

    private configurePower(): void {
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onGet(this.getOn.bind(this))
            .onSet(this.setOn.bind(this));
    }

    private configureBrightness(): void {
        if (!this.supportsCharacteristic(FunctionCharacteristic.Brightness)) return;

        this.service.getCharacteristic(this.platform.Characteristic.Brightness)
            .onGet(this.getBrightness.bind(this))
            .onSet(this.setBrightness.bind(this));
    }

    private configureColorRgb(): void {
        if (!this.supportsCharacteristic(FunctionCharacteristic.ColorRgb)) return;

        this.service.getCharacteristic(this.platform.Characteristic.Hue)
            .onGet(this.getHue.bind(this))
            .onSet(this.setHue.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.Saturation)
            .onGet(this.getSaturation.bind(this))
            .onSet(this.setSaturation.bind(this));
    }

    private async getHue(): Promise<CharacteristicValue> {
        const deviceFc = this.getFunctionForCharacteristics(FunctionCharacteristic.ColorRgb);
        // Try to get the value
        const value = await this.deviceService.getValueAsString(this.device.deviceId, deviceFc);

        // If the value is not defined then show 'Not Responding'
        if (!value) {
            this.setNotResponding();
        }

        const color = convert.hex.hsl(value);

        return color[0];
    }

    private async setHue(value: CharacteristicValue): Promise<void> {
        this._lightColor.hue = value as number;

        if (this.isColorDefined()) {
            await this.setRgbColor(this._lightColor.hue!, this._lightColor.saturation!);
            this.resetColor();
        }
    }

    private async getSaturation(): Promise<CharacteristicValue> {
        const deviceFc = this.getFunctionForCharacteristics(FunctionCharacteristic.ColorRgb);
        // Try to get the value
        const value = await this.deviceService.getValueAsString(this.device.deviceId, deviceFc);

        // If the value is not defined then show 'Not Responding'
        if (!value) {
            this.setNotResponding();
        }

        const color = convert.hex.hsl(value);

        return color[1];
    }

    private async setSaturation(value: CharacteristicValue): Promise<void> {
        this._lightColor.saturation = value as number;

        if (this.isColorDefined()) {
            await this.setRgbColor(this._lightColor.hue!, this._lightColor.saturation!);
            this.resetColor();
        }
    }

    private async getOn(): Promise<CharacteristicValue> {
        const deviceFc = this.getFunctionForCharacteristics(FunctionCharacteristic.Power);
        // Try to get the value
        const value = await this.deviceService.getValueAsBoolean(this.device.deviceId, deviceFc);

        // If the value is not defined then show 'Not Responding'
        if (isNullOrUndefined(value)) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }

        // Otherwise return the value
        return value!;
    }

    private async setOn(value: CharacteristicValue): Promise<void> {
        const deviceFc = this.getFunctionForCharacteristics(FunctionCharacteristic.Power);

        await this.deviceService.setValue(this.device.deviceId, deviceFc, value);
    }

    private async getBrightness(): Promise<CharacteristicValue> {
        const deviceFc = this.getFunctionForCharacteristics(FunctionCharacteristic.Brightness);
        // Try to get the value
        const value = await this.deviceService.getValueAsInteger(this.device.deviceId, deviceFc);

        // If the value is not defined then show 'Not Responding'
        if (isNullOrUndefined(value) || value === -1) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }

        // Otherwise return the value
        return value!;
    }

    private async setBrightness(value: CharacteristicValue): Promise<void> {
        const deviceFc = this.getFunctionForCharacteristics(FunctionCharacteristic.Brightness);

        this.deviceService.setValue(this.device.deviceId, deviceFc, value);
    }

    private setRgbColor(hue: number, saturation: number): Promise<void> {
        const deviceFc = this.getFunctionForCharacteristics(FunctionCharacteristic.ColorRgb);
        const hexValue = convert.hsv.hex([hue, saturation, 100]) as string;

        return this.deviceService.setValue(this.device.deviceId, deviceFc, hexValue);
    }

    private resetColor(): void {
        this._lightColor.hue = undefined;
        this._lightColor.saturation = undefined;
    }

    private isColorDefined(): boolean {
        return !isNullOrUndefined(this._lightColor.hue) && !isNullOrUndefined(this._lightColor.saturation);
    }

    private configureColorTemperature(): void {
        if (!this.supportsCharacteristic(FunctionCharacteristic.ColorTemperature)) return;

        this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
            .setProps({ minValue: 140, maxValue: 500 })
            .onGet(this.getColorTemperature.bind(this))
            .onSet(this.setColorTemperature.bind(this));
    }

    private async getColorTemperature(): Promise<CharacteristicValue> {
        const deviceFc = this.getFunctionForCharacteristics(FunctionCharacteristic.ColorTemperature);
        const rawValue = await this.deviceService.getValueAsString(this.device.deviceId, deviceFc);

        // Parse little-endian hex: e.g. "9808" → 0x0898 = 2200K
        let kelvin = 0;
        if (rawValue && rawValue.length >= 4) {
            const lowByte = parseInt(rawValue.substring(0, 2), 16);
            const highByte = parseInt(rawValue.substring(2, 4), 16);
            kelvin = (highByte << 8) | lowByte;
        }

        if (!kelvin || kelvin <= 0) {
            return 333; // Default ~3000K
        }

        // Convert Kelvin to mired, clamped to HomeKit range
        return Math.max(140, Math.min(500, Math.round(1000000 / kelvin)));
    }

    private async setColorTemperature(value: CharacteristicValue): Promise<void> {
        const deviceFc = this.getFunctionForCharacteristics(FunctionCharacteristic.ColorTemperature);
        const targetKelvin = Math.round(1000000 / (value as number));

        // Hubspace expects color temperature as a little-endian hex-encoded integer
        const lowByte = (targetKelvin & 0xFF).toString(16).padStart(2, '0');
        const highByte = ((targetKelvin >> 8) & 0xFF).toString(16).padStart(2, '0');

        await this.deviceService.setValue(this.device.deviceId, deviceFc, lowByte + highByte);
    }

}