import { Client, Account, Functions, Storage, ID } from 'appwrite';

const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('69d314770014fcf64eaf');

export const account  = new Account(client);
export const functions = new Functions(client);
export const storage  = new Storage(client);
export { ID };
export default client;
