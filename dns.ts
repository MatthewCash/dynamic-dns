export type Name = string[];
export type Address = number[];

export enum QueryType {
    A = 1,
    AAAA = 28,
    CAA = 257,
    CNAME = 5,
    DNAME = 39,
    DS = 43,
    MX = 15,
    NS = 2,
    SRV = 33,
    TXT = 16
}

export enum QueryClass {
    Reserved = 0,
    Internet = 1,
    Unassigned = 2,
    Chaos = 3,
    Hesiod = 4
}

export enum ReplyCode {
    NoError = 0,
    FormatError = 1,
    ServerFailure = 2,
    NameError = 3,
    NotImplemented = 4,
    Refused = 5
}

export interface Query {
    name: Name;
    type: QueryType;
    class: QueryClass;
}

export interface Answer {
    name: Name;
    type: QueryType;
    class: QueryClass;
    ttl: number;
    address: Address;
}

export interface Request {
    transactionId: number;
    rawFlags: number;
    flags: {
        queryResponse?: false;
        opCode?: 0;
        truncated: boolean;
        recursionDesired: boolean;
    };
    questions: number;
    answerRRs: number;
    authorityRRs: number;
    additionalRRs: number;
    queries: Query[];
}

export interface Result {
    transactionId: number;
    rawFlags: number;
    flags: {
        queryResponse?: true;
        opCode?: 0;
        authoritative: boolean;
        truncated: boolean;
        recursionDesired: boolean;
        recursionAvailable: boolean;
        replyCode: ReplyCode;
    };
    questions: number;
    answerRRs: number;
    authorityRRs: number;
    additionalRRs: number;
    queries: Query[];
    answers: Answer[];
}

export const parseIncomingMessage = (data: Buffer): Request => {
    let offset = 0;

    const transactionId = data.readUInt16BE(offset);
    offset += 2;

    const rawFlags = data.readUInt16BE(offset);
    offset += 2;

    const flags: Request['flags'] = {
        truncated: !!(rawFlags & 0b000001000000000),
        recursionDesired: !!(rawFlags & 0b000000100000000)
    };

    const questions = data.readUInt16BE(offset);
    offset += 2;

    const answerRRs = data.readUInt16BE(offset);
    offset += 2;

    const authorityRRs = data.readUInt16BE(offset);
    offset += 2;

    const additionalRRs = data.readUInt16BE(offset);
    offset += 2;

    const queries: Query[] = [];

    for (let i = 0; i < questions; i++) {
        const name: string[] = [];

        let offsetDelta = data.readUInt8(offset);

        while (offsetDelta) {
            name.push(
                data.toString('utf-8', offset + 1, offset + offsetDelta + 1)
            );

            offset += offsetDelta + 1;
            offsetDelta = data.readUInt8(offset);
        }

        offset += 1;

        const queryType = data.readUInt16BE(offset);
        offset += 2;

        const queryClass = data.readUInt16BE(offset);

        queries.push({ name, type: queryType, class: queryClass });
    }

    return {
        transactionId,
        rawFlags,
        flags,
        questions,
        answerRRs,
        authorityRRs,
        additionalRRs,
        queries
    };
};

const writeUIntBE = (long: number, length = 2): number[] => {
    const byteArray = new Array(length).fill(0);

    for (let i = 0; i < length; i++) {
        let currentByte = 0;
        let bytePositionValue = 256 ** (length - i - 1) - 1;

        while (long > bytePositionValue) {
            currentByte += 1;
            long -= bytePositionValue + 1;
        }

        byteArray[i] = currentByte;
    }

    return byteArray;
};

export const buildResponseData = (res: Result): Buffer => {
    // Checks
    if (res.questions !== res.queries.length) {
        throw new Error('Question Count does not match queries length!');
    }
    if (res.answerRRs !== res.answers.length) {
        throw new Error('Answer Count does not match answers length!');
    }

    const usedNames = new Map<Name, number>();
    const data = [];

    data.push(...writeUIntBE(res.transactionId));

    let flags = 0;
    flags += Number(res.flags.queryResponse ?? true) << 15;
    flags += Number(res.flags.opCode ?? 0) << 11;
    flags += Number(res.flags.authoritative) << 10;
    flags += Number(res.flags.truncated) << 7;
    flags += Number(res.flags.recursionDesired) << 8;
    flags += Number(res.flags.recursionAvailable) << 7;
    flags += Number(res.flags.replyCode) << 0;

    data.push(...writeUIntBE(flags, 2));

    data.push(...writeUIntBE(res.questions));

    data.push(...writeUIntBE(res.answerRRs));
    data.push(...writeUIntBE(res.authorityRRs));
    data.push(...writeUIntBE(res.additionalRRs));

    res.queries.forEach(query => {
        const encodedName = query.name.reduce(
            (acc, label) => (acc += String.fromCharCode(label.length) + label),
            ''
        );

        usedNames.set(query.name, data.length);

        data.push(...encodedName.split('').map(char => char.charCodeAt(0)), 0);

        data.push(...writeUIntBE(query.type));
        data.push(...writeUIntBE(query.class));
    });

    res.answers.forEach(answer => {
        data.push(0xc0, usedNames.get(answer.name));

        data.push(...writeUIntBE(answer.type));
        data.push(...writeUIntBE(answer.class));

        data.push(...writeUIntBE(answer.ttl, 4));

        data.push(...writeUIntBE(answer.address.length));
        data.push(...answer.address);
    });

    return Buffer.from(data);
};
