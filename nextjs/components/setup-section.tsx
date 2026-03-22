"use client";

import { useLanguage } from "./language-provider";

const steps = [
  {
    id: "openrouter",
    titleEn: "OpenRouter (Recommended)",
    titleEs: "OpenRouter (Recomendado)",
    descriptionEn:
      "Get an API key to let your mochi speak. Paste it in the extension popup.",
    descriptionEs:
      "Consigue una API key para que tu mochi hable. Pegala en el popup de la extensión.",
    bulletsEn: [
      "Create an OpenRouter account and generate an API key.",
      "Open the extension popup → Standard → OpenRouter → paste the key.",
      "Pick your model (or keep the default).",
    ],
    bulletsEs: [
      "Crea tu cuenta en OpenRouter y genera una API key.",
      "Abre el popup → Standard → OpenRouter → pega la key.",
      "Elige un modelo (o deja el default).",
    ],
  },
  {
    id: "openclaw",
    titleEn: "OpenClaw Agent",
    titleEs: "Agente OpenClaw",
    descriptionEn:
      "Use your OpenClaw gateway for real actions online and onchain.",
    descriptionEs:
      "Usa tu gateway de OpenClaw para acciones reales online y onchain.",
    bulletsEn: [
      "Run OpenClaw locally or on your server.",
      "Copy the WebSocket URL + gateway token.",
      "Popup → AI Agent → paste Gateway URL + Token.",
    ],
    bulletsEs: [
      "Corre OpenClaw localmente o en tu servidor.",
      "Copia el WebSocket y el gateway token.",
      "Popup → AI Agent → pega Gateway URL + Token.",
    ],
  },
  {
    id: "ollama",
    titleEn: "Ollama Local",
    titleEs: "Ollama Local",
    descriptionEn:
      "Run models on your machine and keep everything local.",
    descriptionEs:
      "Corre modelos en tu máquina y mantené todo local.",
    bulletsEn: [
      "Install Ollama and pull a model (e.g. llama3.1).",
      "Popup → Standard → Provider: Ollama.",
      "Set `Ollama URL` and your model name.",
    ],
    bulletsEs: [
      "Instala Ollama y descarga un modelo (ej. llama3.1).",
      "Popup → Standard → Provider: Ollama.",
      "Configura `Ollama URL` y el nombre del modelo.",
    ],
  },
];

export function SetupSection() {
  const { isSpanish } = useLanguage();

  return (
    <section id="setup" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-6 text-center mb-12">
          <p className="uppercase tracking-[0.3em] text-xs text-muted-foreground font-mono">
            {isSpanish ? "Configuración" : "Configuration"}
          </p>
          <h2 className="text-4xl sm:text-5xl font-semibold text-foreground">
            {isSpanish
              ? "Conecta tu stack de IA en minutos"
              : "Connect your AI stack in minutes"}
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            {isSpanish
              ? "Cada mochi se configura por separado. Podés usar OpenRouter, OpenClaw o Ollama según tu flujo."
              : "Each mochi is configured independently. Use OpenRouter, OpenClaw, or Ollama depending on your workflow."}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {steps.map((step) => (
            <div key={step.id} className="neural-card rounded-3xl p-8">
              <div className="flex items-center justify-between mb-6">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-mono">
                  {step.id}
                </span>
              
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-3">
                {isSpanish ? step.titleEs : step.titleEn}
              </h3>
              <p className="text-muted-foreground mb-6">
                {isSpanish ? step.descriptionEs : step.descriptionEn}
              </p>
              <div className="flex flex-col gap-3 text-sm text-foreground/80">
                {(isSpanish ? step.bulletsEs : step.bulletsEn).map((item) => (
                  <span key={item} className="flex gap-3">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--brand-accent)]" />
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
