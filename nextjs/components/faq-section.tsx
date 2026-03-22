"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollAnimation } from "./scroll-animation";
import { useLanguage } from "./language-provider";

const faqs = [
  {
    question: "What is a mochi?",
    answer:
      "Mochi are animated pets that originated in Japan. They live on your screen, wander around, and — with this extension — chat with you using AI.",
  },
  {
    question: "What is Standard mode?",
    answer:
      "Standard mode is text-only AI chat. Pick a personality, choose OpenRouter or Ollama, and your mochi responds in character.",
  },
  {
    question: "What is AI Agent mode?",
    answer:
      "AI Agent mode connects your mochi to an OpenClaw gateway, giving it access to online and onchain tools beyond simple chat.",
  },
  {
    question: "Do I need an API key?",
    answer:
      "For Standard mode, you can use OpenRouter (API key) or Ollama (local). For AI Agent mode, you need a running OpenClaw gateway.",
  },
  {
    question: "Can I run local models?",
    answer:
      "Yes. Choose Ollama in Standard mode and point it to your local Ollama URL and model.",
  },
  {
    question: "Is the Chrome extension free?",
    answer:
      "Yes. The extension is free and includes a default mascot with full AI chat. Custom mochis are available through the auction.",
  },
  {
    question: "Do I need a wallet?",
    answer:
      "Only if you want to bid on a custom mochi in the auction. The AI chat features work without a wallet.",
  },
];

export function FAQSection() {
  const { isSpanish } = useLanguage();
  const variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.5 } },
  };

  return (
    <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8">
      <ScrollAnimation variants={variants}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            
            <h2 className="text-4xl sm:text-5xl font-semibold text-foreground tracking-tight">
              {isSpanish ? "Preguntas Frecuentes" : "Frequently Asked Questions"}
            </h2>
          </div>

          <Accordion type="single" collapsible className="w-full space-y-3">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="neural-card border border-white/10 rounded-2xl px-6 data-[state=open]:shadow-sm"
              >
                <AccordionTrigger className="text-md text-left text-foreground hover:no-underline py-5 font-semibold">
                  {isSpanish
                    ? index === 0
                      ? "¿Qué es un mochi?"
                      : index === 1
                        ? "¿Qué es el modo Standard?"
                        : index === 2
                          ? "¿Qué es el modo AI Agent?"
                        : index === 3
                          ? "¿Necesito una API key?"
                        : index === 4
                              ? "¿Puedo usar modelos locales?"
                              : index === 5
                                ? "¿La extensión de Chrome es gratis?"
                                : "¿Necesito una wallet?"
                    : faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-md text-muted-foreground pb-5 leading-relaxed">
                  {isSpanish
                    ? index === 0
                      ? "Los mochi son mascotas animados que nacieron en Japón. Viven en tu pantalla, pasean y — con esta extensión — chatean contigo usando IA."
                      : index === 1
                        ? "El modo Standard es chat de texto con IA. Elegís una personalidad y usás OpenRouter o Ollama."
                        : index === 2
                          ? "El modo AI Agent conecta tu mochi a un gateway OpenClaw. Esto le da acceso a herramientas online y onchain más allá del chat de texto."
                        : index === 3
                            ? "Para el modo Standard podés usar OpenRouter (API key) u Ollama local. Para el modo AI Agent necesitás un gateway OpenClaw corriendo."
                        : index === 4
                              ? "Sí. Elegís Ollama en Standard y apuntás a tu URL local y modelo."
                              : index === 5
                                ? "Sí. La extensión es gratuita e incluye una mascota por defecto con chat IA. Los mochis personalizados se consiguen en la subasta."
                                : "Solo si querés ofertar por un mochi personalizado en la subasta. Las funciones de chat IA funcionan sin wallet."
                    : faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </ScrollAnimation>
    </section>
  );
}
