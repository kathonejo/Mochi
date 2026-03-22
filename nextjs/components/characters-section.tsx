"use client";

import { useState } from "react";
import ViewCollectionButton from "./viewcollection-button";
import { ScrollAnimation } from "./scroll-animation";
import { useLanguage } from "./language-provider";

const characters = [
  {
    id: 1,
    name: "Mochi",
    rarity: "Common",
    traits: ["Playful", "Bouncy"],
    image: "/cute-white-bunny-mascot-kawaii-chibi-pastel-soft-c.jpg",
  },
  {
    id: 2,
    name: "Kira",
    rarity: "Rare",
    traits: ["Sparkly", "Magical"],
    image: "/cute-pink-cat-mascot-kawaii-chibi-sparkles-pastel.jpg",
  },
  {
    id: 3,
    name: "Taro",
    rarity: "Epic",
    traits: ["Sleepy", "Fluffy"],
    image: "/cute-orange-fox-mascot-kawaii-chibi-sleepy-soft.jpg",
  },
  {
    id: 4,
    name: "Luna",
    rarity: "Legendary",
    traits: ["Mystical", "Wise"],
    image: "/cute-purple-owl-mascot-kawaii-chibi-magical-dreamy.jpg",
  },
];

const rarityStyles: Record<string, { bg: string; text: string }> = {
  Common: { bg: "bg-muted", text: "text-muted-foreground" },
  Rare: { bg: "bg-blue-500/10", text: "text-blue-600" },
  Epic: { bg: "bg-amber-500/10", text: "text-amber-600" },
  Legendary: { bg: "bg-accent/20", text: "text-accent" },
};

export function CharactersSection() {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const { isSpanish } = useLanguage();

  const rarityLabel: Record<string, string> = {
    Common: isSpanish ? "Común" : "Common",
    Rare: isSpanish ? "Raro" : "Rare",
    Epic: isSpanish ? "Épico" : "Epic",
    Legendary: isSpanish ? "Legendario" : "Legendary",
  };

  const traitLabel: Record<string, string> = {
    Playful: isSpanish ? "Juguetón" : "Playful",
    Bouncy: isSpanish ? "Saltarín" : "Bouncy",
    Sparkly: isSpanish ? "Brillante" : "Sparkly",
    Magical: isSpanish ? "Mágico" : "Magical",
    Sleepy: isSpanish ? "Dormilón" : "Sleepy",
    Fluffy: isSpanish ? "Esponjoso" : "Fluffy",
    Mystical: isSpanish ? "Místico" : "Mystical",
    Wise: isSpanish ? "Sabio" : "Wise",
  };

  const variants = {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5 } },
  };

  return (
    <section id="characters" className="py-8 px-4 sm:px-6 lg:px-8">
      <ScrollAnimation variants={variants}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight text-balance">
              {isSpanish ? "Conocé a los personajes" : "Meet the Characters"}
            </h2>
            <p className="text-lg text-muted-foreground mt-4 max-w-xl mx-auto">
              {isSpanish
                ? "Cada huevo puede revelar un mochi único con su propia personalidad y animaciones."
                : "Each egg can reveal a unique mochi with its own personality and animations"}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {characters.map((character) => (
              <div
                key={character.id}
                className="group bg-card rounded-3xl p-5 border border-border hover:shadow-xl transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setHoveredId(character.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div className="relative aspect-square mb-5 bg-secondary/50 rounded-2xl overflow-hidden">
                  <img
                    src={character.image || "/placeholder.svg"}
                    alt={character.name}
                    className={`w-full h-full object-cover transition-transform duration-500 ${
                      hoveredId === character.id ? "scale-110" : ""
                    }`}
                  />
                </div>

                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-foreground">
                    {character.name}
                  </h3>
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      rarityStyles[character.rarity].bg
                    } ${rarityStyles[character.rarity].text}`}
                  >
                    {rarityLabel[character.rarity] || character.rarity}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {character.traits.map((trait) => (
                    <span
                      key={trait}
                      className="text-xs px-2.5 py-1 bg-muted text-muted-foreground rounded-full"
                    >
                      {traitLabel[trait] || trait}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <ViewCollectionButton />
          </div>
        </div>
      </ScrollAnimation>
    </section>
  );
}
