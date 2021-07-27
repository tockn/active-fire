import firebase from 'firebase';
import { QueryChain } from './query_chain';
import { DocumentFields, IDocumentClass } from './types';
import { FastFireDocument } from './fastfire_document';
import { unique } from './utils';

export abstract class FastFire {
  static firestore: firebase.firestore.Firestore;

  static initialize(firestore: firebase.firestore.Firestore) {
    this.firestore = firestore;
  }

  static async create<T extends FastFireDocument<T>>(
    documentClass: IDocumentClass<T>,
    fields: DocumentFields<T>
  ): Promise<T> {
    const data: DocumentFields<T> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (
        documentClass.referenceClassMap[key] &&
        value instanceof FastFireDocument
      ) {
        data[key as keyof typeof data] = value.reference;
        continue;
      }
      if (!documentClass.fieldMap[key])
        throw new UnknownFieldCreateError(documentClass.name, key);
      // TODO We can implement validation logic here
      data[key as keyof typeof data] = value;
    }
    const docRef = await this.firestore
      .collection(documentClass.name)
      .add(data);
    const doc = await docRef.get();
    return this.fromSnapshot(documentClass, doc) as T;
  }

  static async findById<T extends FastFireDocument<T>>(
    documentClass: IDocumentClass<T>,
    id: string
  ): Promise<T | null> {
    const doc = await this.firestore
      .collection(documentClass.name)
      .doc(id)
      .get();
    return this.fromSnapshot<T>(documentClass, doc);
  }

  static where<T extends FastFireDocument<T>>(
    documentClass: IDocumentClass<T>,
    fieldPath: keyof T | firebase.firestore.FieldPath,
    opStr: firebase.firestore.WhereFilterOp,
    value: any
  ): QueryChain<T> {
    const query = this.firestore
      .collection(documentClass.name)
      .where(fieldPath as string, opStr, value);
    return new QueryChain(documentClass, query);
  }

  static async all<T extends FastFireDocument<T>>(
    documentClass: IDocumentClass<T>
  ): Promise<T[]> {
    const snapshots = await this.firestore.collection(documentClass.name).get();
    const results: T[] = [];
    snapshots.forEach(snapshot => {
      const data = this.fromSnapshot<T>(documentClass, snapshot);
      if (!data) return;
      results.push(data);
    });
    return results;
  }

  static preload<T extends FastFireDocument<T>>(
    documentClass: IDocumentClass<T>,
    referenceFields: (keyof T)[]
  ): QueryChain<T> {
    return new QueryChain<T>(documentClass, undefined, unique(referenceFields));
  }

  static fromSnapshot<T extends FastFireDocument<T>>(
    documentClass: IDocumentClass<T>,
    snapshot: firebase.firestore.DocumentSnapshot
  ): T | null {
    if (!snapshot.exists) return null;
    const obj = new documentClass(snapshot.id);

    const data = snapshot.data() as never;
    const keys = Object.keys(data) as never[];
    for (const key of keys) {
      if (documentClass.referenceClassMap[key]) {
        obj[key] = new documentClass.referenceClassMap[key](
          (data[key] as firebase.firestore.DocumentReference).id
        ) as never;
      } else {
        obj[key] = data[key] as never;
      }
    }
    return obj;
  }
}

class UnknownFieldCreateError extends Error {
  constructor(documentName: string, fieldName: string) {
    super(
      `You are trying to create unknown field "${fieldName}" in "${documentName}"`
    );
  }
}
