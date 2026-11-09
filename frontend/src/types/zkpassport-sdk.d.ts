declare module "@zkpassport/sdk" {
  export interface ZKPassportRequestBuilder {
    gte: (field: string, value: number) => {
      done: () => { url: string; requestId: string };
    };
  }

  export class ZKPassport {
    constructor(domain: string);
    request: (payload: {
      name: string;
      logo: string;
      purpose: string;
      scope: string;
      devMode: boolean;
    }) => Promise<ZKPassportRequestBuilder>;
  }
}
