"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { photos, programmes } from "@/content/site";
import { Arrow } from "@/components/ui/primitives";
export function ProgramExplorer() {
  const [active, setActive] = useState(0);
  const current = photos[programmes[active].image];
  return (
    <div className="program-explorer">
      <ol>
        {programmes.map((p, i) => (
          <li key={p.id}>
            <Link
              href={`/programmes#${p.id}`}
              data-active={active === i}
              onFocus={() => setActive(i)}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setActive(i);
              }}
            >
              <span className="index">0{i + 1}</span>
              <div>
                <h3>{p.name}</h3>
                <p>{p.summary}</p>
              </div>
              <Arrow diagonal />
            </Link>
          </li>
        ))}
      </ol>
      <figure className="explorer-photo">
        <div>
          {programmes.map((p, i) => (
            <Image
              key={p.id}
              src={photos[p.image].src}
              alt=""
              fill
              sizes="45vw"
              className={active === i ? "visible" : ""}
            />
          ))}
          <span className="photo-label">
            0{active + 1} / {programmes[active].short}
          </span>
        </div>
        <figcaption>{current.location}</figcaption>
      </figure>
    </div>
  );
}
