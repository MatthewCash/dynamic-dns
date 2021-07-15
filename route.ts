import dns from 'dns';
import wifi from 'node-wifi';
import { Address, Name } from './dns';
import systems from './systems.json';

const localBssid = process.env.BSSID;

wifi.init({ iface: 'Wi-Fi' });

export const getAddress = async (name: Name): Promise<Address> => {
    const system = systems.find(system => system.name === name.join('.'));
    if (!system) {
        return null;
    }

    const bssids = await new Promise<string[]>((resolve, reject) => {
        wifi.getCurrentConnections((error, connections) => {
            if (error) return reject(error);
            resolve(connections.map(con => con.bssid));
        });
    });

    const atLocal = bssids.includes(localBssid);

    if (!atLocal) return system.vpn;

    const localAddress = await new Promise<Address>((resolve, reject) => {
        dns.lookup(name.join('.'), (error, address) => {
            if (error) return reject(error);
            resolve(address.split('.').map(char => Number(char)));
        });
    });

    return localAddress;
};
