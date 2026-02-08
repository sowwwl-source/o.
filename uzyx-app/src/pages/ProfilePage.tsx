import React, { useEffect } from "react";
import "./profile.css";
import { ZeroisoModule } from "@/zeroiso/ZeroisoModule";
import { usePerceptionStore } from "@/perception/PerceptionProvider";

export function ProfilePage(props: { handle: string }) {
  const store = usePerceptionStore();

  useEffect(() => {
    store.setBaseProfile("land");
  }, [store]);

  const handle = String(props.handle || "anon").replace(/^@+/, "");

  return (
    <main className="profileRoot" aria-label="profil">
      <header className="profileTop">
        <div className="profileHandle" aria-label="handle">
          u/{handle}
        </div>
        <div className="profileMeta" aria-hidden="true">
          profil · modules
        </div>
      </header>

      <section className="profileGrid" aria-label="modules">
        <ZeroisoModule handle={handle} />

        <aside className="profileAside" aria-label="placeholders">
          <div className="profileAsideLine">
            <span className="profileKey">1n1tc(o)ntact</span>
            <span className="profileVal">répertoire · local</span>
          </div>
          <div className="profileAsideLine">
            <span className="profileKey">FERRY</span>
            <span className="profileVal">collectif · session</span>
          </div>
          <div className="profileAsideLine">
            <span className="profileKey">STR 3M</span>
            <span className="profileVal">dérive · points/degrés</span>
          </div>
          <div className="profileAsideLine">
            <span className="profileKey">LAND</span>
            <span className="profileVal">intérieur · inversion</span>
          </div>
        </aside>
      </section>
    </main>
  );
}

