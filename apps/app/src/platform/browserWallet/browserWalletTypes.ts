export type BrowserWalletAccount = {
  address: string;
  label?: string;
  walletName?: string;
};

export type BrowserWalletConnectResult = {
  address: string;
  walletName?: string;
};

export type BrowserWalletSignInput = {
  serializedPayloadBase64: string;
};

export type BrowserWalletSignResult = {
  signedPayloadBase64: string;
};