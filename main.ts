import dgram from 'dgram';
import {
    buildResponseData,
    parseIncomingMessage,
    QueryType,
    ReplyCode,
    Result,
    Address
} from './dns';
import { getAddress } from './route';

const server = dgram.createSocket('udp4');

const ttl = 900;
const acceptableQuery = QueryType.A;

server.on('message', async (message, rinfo) => {
    const request = parseIncomingMessage(message);

    let success = acceptableQuery === request.queries[0].type;

    let address: Address;
    if (success)
        address = await getAddress(request.queries[0]?.name).catch(null);

    if (!address) success = false;

    const result: Result = {
        ...request,
        answers: success
            ? [
                  {
                      ...request.queries[0],
                      ttl,
                      address
                  }
              ]
            : [],
        flags: {
            authoritative: true,
            truncated: false,
            recursionDesired: true,
            recursionAvailable: true,
            replyCode: success ? ReplyCode.NoError : ReplyCode.Refused
        },
        answerRRs: success ? 1 : 0,
        authorityRRs: 0,
        additionalRRs: 0
    };

    const data = buildResponseData(result);

    server.send(data, rinfo.port, rinfo.address);
});

server.on('listening', () => {
    const address = server.address();
    console.log(
        `[Ready] DNS Server running on ${address.address}:${address.port}`
    );
});

server.bind(53);
