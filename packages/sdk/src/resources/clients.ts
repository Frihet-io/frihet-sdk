import type { HttpClient } from '../client.js';
import type { Client, CreateClientParams, UpdateClientParams, ClientListParams, ClientContact, CreateContactParams, UpdateContactParams, ClientNote, CreateNoteParams, UpdateNoteParams, ClientActivity, CreateActivityParams, Page, ListParams, RequestOptions } from '../types.js';

const enc = encodeURIComponent;

export class Clients {
  constructor(private _client: HttpClient) {}

  list(params?: ClientListParams, opts?: RequestOptions): Promise<Page<Client>> {
    return this._client.getPage('/clients', params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieve(id: string, opts?: RequestOptions): Promise<Client> {
    return this._client.get(`/clients/${enc(id)}`, undefined, opts);
  }

  create(params: CreateClientParams, opts?: RequestOptions): Promise<Client> {
    return this._client.post('/clients', params, opts);
  }

  update(id: string, params: UpdateClientParams, opts?: RequestOptions): Promise<Client> {
    return this._client.patch(`/clients/${enc(id)}`, params, opts);
  }

  del(id: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/clients/${enc(id)}`, opts);
  }

  search(query: string, params?: Omit<ClientListParams, 'q'>, opts?: RequestOptions): Promise<Page<Client>> {
    return this._client.getPage('/clients', { q: query, ...params } as Record<string, string | number | boolean | undefined>, opts);
  }

  // --- CRM: Contacts ---

  listContacts(clientId: string, params?: ListParams, opts?: RequestOptions): Promise<Page<ClientContact>> {
    return this._client.getPage(`/clients/${enc(clientId)}/contacts`, params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieveContact(clientId: string, contactId: string, opts?: RequestOptions): Promise<ClientContact> {
    return this._client.get(`/clients/${enc(clientId)}/contacts/${enc(contactId)}`, undefined, opts);
  }

  createContact(clientId: string, params: CreateContactParams, opts?: RequestOptions): Promise<ClientContact> {
    return this._client.post(`/clients/${enc(clientId)}/contacts`, params, opts);
  }

  updateContact(clientId: string, contactId: string, params: UpdateContactParams, opts?: RequestOptions): Promise<ClientContact> {
    return this._client.patch(`/clients/${enc(clientId)}/contacts/${enc(contactId)}`, params, opts);
  }

  deleteContact(clientId: string, contactId: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/clients/${enc(clientId)}/contacts/${enc(contactId)}`, opts);
  }

  // --- CRM: Activities ---

  listActivities(clientId: string, params?: ListParams, opts?: RequestOptions): Promise<Page<ClientActivity>> {
    return this._client.getPage(`/clients/${enc(clientId)}/activities`, params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieveActivity(clientId: string, activityId: string, opts?: RequestOptions): Promise<ClientActivity> {
    return this._client.get(`/clients/${enc(clientId)}/activities/${enc(activityId)}`, undefined, opts);
  }

  createActivity(clientId: string, params: CreateActivityParams, opts?: RequestOptions): Promise<ClientActivity> {
    return this._client.post(`/clients/${enc(clientId)}/activities`, params, opts);
  }

  // --- CRM: Notes ---

  listNotes(clientId: string, params?: ListParams, opts?: RequestOptions): Promise<Page<ClientNote>> {
    return this._client.getPage(`/clients/${enc(clientId)}/notes`, params as Record<string, string | number | boolean | undefined>, opts);
  }

  retrieveNote(clientId: string, noteId: string, opts?: RequestOptions): Promise<ClientNote> {
    return this._client.get(`/clients/${enc(clientId)}/notes/${enc(noteId)}`, undefined, opts);
  }

  createNote(clientId: string, params: CreateNoteParams, opts?: RequestOptions): Promise<ClientNote> {
    return this._client.post(`/clients/${enc(clientId)}/notes`, params, opts);
  }

  updateNote(clientId: string, noteId: string, params: UpdateNoteParams, opts?: RequestOptions): Promise<ClientNote> {
    return this._client.patch(`/clients/${enc(clientId)}/notes/${enc(noteId)}`, params, opts);
  }

  deleteNote(clientId: string, noteId: string, opts?: RequestOptions): Promise<void> {
    return this._client.del(`/clients/${enc(clientId)}/notes/${enc(noteId)}`, opts);
  }
}
