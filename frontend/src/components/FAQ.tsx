import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Heading,
} from '@chakra-ui/react';

export function FAQ() {
  const faqs = [
    {
      q: `What is RAKSHA112?`,
      a: `RAKSHA112 is an academic AI simulation project designed to explore how automated NLP and voice AI can assist emergency dispatchers under India's unified Emergency Response Support System (ERSS - 112). When human operators are overwhelmed, RAKSHA112 triages incoming calls, extracts critical details (caller name, Indian location, emergency nature), and flags priority.`,
    },
    {
      q: `How does the RAKSHA112 simulation work?`,
      a: `When a caller dials the Twilio simulation demo line, RAKSHA112 streams the caller's audio in real-time via WebSockets to AssemblyAI for speech-to-text. Indic NLP models (ai4bharat/IndicNER and mDeBERTa) extract the caller's identity and Indian location, while emergency classifiers categorize the incident (Medical, Fire, Traffic Accident, Crime, etc.) and calculate priority on the dispatcher dashboard.`,
    },
    {
      q: `How does this relate to India's real emergency numbers (112, 100, 101, 108)?`,
      a: `In India, 112 is the nationwide Emergency Response Support System (ERSS) that integrates Police (100), Fire (101), Ambulance (108), and Disaster Management. RAKSHA112 is conceptualized around the 112 ERSS workflow. In a real-world deployment, this system would interface with state ERSS control centers, while legacy numbers (100/101/108) continue as automatic rerouting fallbacks.`,
    },
    {
      q: `How does RAKSHA112 extract Indian names and locations?`,
      a: `RAKSHA112 uses IndicNER (ai4bharat/IndicNER), a transformer model trained specifically on Indian names, places, and regional entities, paired with Google Maps Geocoding API with India-specific region biasing (region=in) to map addresses accurately.`,
    },
    {
      q: `How is call severity/priority determined?`,
      a: `Priority is determined by analyzing real-time transcript keywords (e.g., 'injured', 'fire', 'accident', 'heart attack', 'chori/theft', 'cylinder blast') along with zero-shot classification confidence to flag calls as HIGH, MEDIUM, or LOW priority.`,
    },
    {
      q: `What is the Recorded Audio Fallback Intake?`,
      a: `To support demonstrations without depending on carrier networks, live Twilio trial numbers, or ngrok tunnels, RAKSHA112 includes an asynchronous audio upload fallback. Evaluators can upload pre-recorded .wav, .mp3, .m4a, or .ogg audio scenarios which are transcribed via AssemblyAI async API and triaged through the exact same Indic NER, mDeBERTa classification, and India geocoding pipeline as live calls.`,
    },
    {
      q: `* Can I use this demo in a real emergency? Should I call this number instead of 112?`,
      a: "ABSOLUTELY NOT! RAKSHA112 is strictly an academic college project demo and simulation. It has NO connection to India's official 112 ERSS, police, fire, or hospital services. In case of a real emergency anywhere in India, immediately dial 112 (or 100 Police, 101 Fire, 108 Ambulance) from your phone.",
    },
  ];

  return (
    <Box id="faq" mt={10}>
      <Heading as="h2" fontSize="16px" fontWeight="600" color="var(--ink)" mb={3}>
        Operational Guide & Technical Specifications
      </Heading>
      <Box bg="var(--surface)" border="1px solid var(--rule)" borderRadius="2px">
        <Accordion defaultIndex={[0]} allowMultiple>
          {faqs.map(({ q, a }, idx) => (
            <AccordionItem key={idx} borderTop={idx === 0 ? 'none' : '1px solid var(--rule)'} borderBottom="none">
              <h2>
                <AccordionButton py={3} px={4} _hover={{ bg: 'var(--surface-alt)' }}>
                  <Box flex="1" textAlign="left" fontWeight="600" fontSize="13px" color="var(--ink)">
                    {q}
                  </Box>
                  <AccordionIcon />
                </AccordionButton>
              </h2>
              <AccordionPanel pb={4} px={4} fontSize="13px" color="#4B5565" lineHeight="1.6" bg="var(--surface-alt)">
                {a}
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </Box>
    </Box>
  );
}
