import React, { useMemo, useState } from "react";
import "./contacts.css";
import { addContact, listContacts, removeContact, type Contact } from "./contactsStore";

type SortMode = "recent" | "alpha";

export function ContactsPage() {
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [tick, setTick] = useState(0);

  const contacts = useMemo(() => {
    let list = listContacts();
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.handle.toLowerCase().includes(q) ||
          (c.note || "").toLowerCase().includes(q)
      );
    }
    if (sort === "alpha") {
      list.sort((a, b) => a.handle.localeCompare(b.handle));
    } else {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  }, [query, sort, tick]);

  const onAdd = () => {
    if (!handle.trim()) return;
    addContact(handle.trim(), note.trim() || undefined);
    setHandle("");
    setNote("");
    setTick((t) => t + 1);
  };

  const onRemove = (id: string) => {
    removeContact(id);
    setTick((t) => t + 1);
  };

  return (
    <main className="contacts">
      <section className="contactsHeader">
        <div className="contactsTitle">1n1tc(o)ntact</div>
        <div className="contactsMeta">repertoire local</div>
      </section>

      <section className="contactsPanel">
        <div className="contactsProfile">
          <div className="contactsLabel">profil minimal</div>
          <div className="row">
            <input
              className="contactsInput"
              aria-label="handle"
              placeholder="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
            <input
              className="contactsInput"
              aria-label="note"
              placeholder="note (optionnel)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button className="btn" onClick={onAdd}>
              add to 1n1tc(o)ntact
            </button>
          </div>
        </div>
      </section>

      <section className="contactsPanel">
        <div className="row">
          <input
            className="contactsInput"
            aria-label="recherche"
            placeholder="rechercher"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn" onClick={() => setSort(sort === "alpha" ? "recent" : "alpha")}>
            tri: {sort}
          </button>
        </div>
      </section>

      <section className="contactsGrid" aria-label="liste contacts">
        {contacts.map((c) => (
          <ContactCard key={c.id} contact={c} onRemove={onRemove} />
        ))}
      </section>
    </main>
  );
}

function ContactCard(props: { contact: Contact; onRemove: (id: string) => void }) {
  const { contact, onRemove } = props;
  return (
    <div className="contactCard">
      <div className="contactHandle">{contact.handle}</div>
      {contact.note ? <div className="contactNote">{contact.note}</div> : null}
      <button className="btn" onClick={() => onRemove(contact.id)}>
        retirer
      </button>
    </div>
  );
}
