import React from 'react';
import {
  Box,
  Heading,
  Text,
  Button,
  VStack,
  HStack,
  Flex,
  Divider,
  SimpleGrid,
  Icon,
  Badge,
} from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { FiLock, FiArrowRight, FiShield, FiCpu, FiMapPin, FiActivity } from 'react-icons/fi';

export const Landing: React.FC = () => {
  return (
    <Box minH="100vh" bg="var(--surface)" color="var(--ink)">
      {/* Top Header Bar */}
      <Box borderBottom="1px solid var(--rule)" px={{ base: 6, md: 12 }} py={4} bg="var(--surface)">
        <Flex justify="space-between" align="center" maxW="1200px" mx="auto">
          <HStack spacing={3}>
            <Icon as={FiShield} w={5} h={5} color="var(--accent)" />
            <Text fontWeight="600" fontSize="15px" letterSpacing="0.01em" color="var(--ink)">
              RAKSHA112
            </Text>
            <Badge
              bg="var(--surface-alt)"
              color="var(--ink)"
              border="1px solid var(--rule)"
              fontSize="11px"
              fontWeight="500"
              px={2}
              py={0.5}
              borderRadius="2px"
            >
              ERSS-112 Prototype
            </Badge>
          </HStack>

          <Button
            as={RouterLink}
            to="/login"
            size="sm"
            bg="var(--accent)"
            color="white"
            _hover={{ bg: 'var(--accent-hover)' }}
            borderRadius="2px"
            fontWeight="500"
            fontSize="13px"
            rightIcon={<FiLock size={12} />}
          >
            Operator Sign In
          </Button>
        </Flex>
      </Box>

      {/* Mandatory Emergency Disclaimer Banner */}
      <Box bg="#FFF8E6" borderBottom="1px solid #FFE082" px={{ base: 6, md: 12 }} py={3}>
        <Box maxW="1200px" mx="auto">
          <Text fontSize="13px" color="#664D03" fontWeight="500">
            <strong>⚠️ Academic Simulation Notice:</strong> RAKSHA112 is strictly an experimental educational demonstration. It is not connected to India's official ERSS-112 network, police control rooms, or healthcare authorities. In a real emergency in India, dial <strong>112</strong> (or 100 / 101 / 108) directly from your phone.
          </Text>
        </Box>
      </Box>

      {/* Main Content Area — Strictly Left-Aligned Institutional Layout */}
      <Box maxW="1200px" mx="auto" px={{ base: 6, md: 12 }} py={{ base: 10, md: 16 }}>
        <VStack align="flex-start" spacing={8} maxW="840px">
          <Box>
            <Text fontSize="12px" fontWeight="600" color="var(--accent)" letterSpacing="0.06em" mb={2}>
              EMERGENCY RESPONSE SUPPORT SYSTEM • AUTOMATED VOICE TRIAGE
            </Text>
            <Heading
              as="h1"
              fontSize={{ base: '26px', md: '34px' }}
              fontWeight="600"
              lineHeight="1.2"
              color="var(--ink)"
              mb={4}
            >
              Intelligent triage and classification for high-volume emergency response dispatch.
            </Heading>
            <Text fontSize="15px" lineHeight="1.6" color="#3E4754">
              RAKSHA112 is an automated intake pipeline designed to assist emergency control room operators during surge events and line congestion. The system ingests caller voice streams, transcribes regional speech, extracts Indian entities, evaluates situational priority, and presents structured incident tickets to dispatchers in real time.
            </Text>
          </Box>

          {/* Primary Action Button */}
          <HStack spacing={4}>
            <Button
              as={RouterLink}
              to="/login"
              size="md"
              bg="var(--accent)"
              color="white"
              _hover={{ bg: 'var(--accent-hover)' }}
              borderRadius="2px"
              fontWeight="500"
              fontSize="14px"
              px={6}
              py={5}
              rightIcon={<FiArrowRight size={14} />}
            >
              Enter Operator Console
            </Button>
          </HStack>
        </VStack>

        <Divider my={12} borderColor="var(--rule)" />

        {/* Operational Architecture Overview */}
        <VStack align="flex-start" spacing={6} w="full">
          <Text fontSize="16px" fontWeight="600" color="var(--ink)">
            Pipeline Architecture & Functional Capabilities
          </Text>

          <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6} w="full">
            <Box p={5} bg="var(--surface-alt)" border="1px solid var(--rule)" borderRadius="2px">
              <HStack spacing={3} mb={3}>
                <Icon as={FiActivity} color="var(--accent)" w={4} h={4} />
                <Text fontSize="14px" fontWeight="600" color="var(--ink)">
                  Telephony & Ingestion
                </Text>
              </HStack>
              <Text fontSize="13px" color="#4B5565" lineHeight="1.5">
                Dual intake supporting real-time Twilio telephony stream (8kHz μ-law) as well as offline recorded audio ingestion (.wav, .mp3, .m4a, .ogg) for evaluation.
              </Text>
            </Box>

            <Box p={5} bg="var(--surface-alt)" border="1px solid var(--rule)" borderRadius="2px">
              <HStack spacing={3} mb={3}>
                <Icon as={FiCpu} color="var(--accent)" w={4} h={4} />
                <Text fontSize="14px" fontWeight="600" color="var(--ink)">
                  Indic Entity Extraction
                </Text>
              </HStack>
              <Text fontSize="13px" color="#4B5565" lineHeight="1.5">
                Utilizes transformer-based Named Entity Recognition (ai4bharat/IndicNER) specifically tuned for Indian personal names, landmarks, and regional locations.
              </Text>
            </Box>

            <Box p={5} bg="var(--surface-alt)" border="1px solid var(--rule)" borderRadius="2px">
              <HStack spacing={3} mb={3}>
                <Icon as={FiShield} color="var(--accent)" w={4} h={4} />
                <Text fontSize="14px" fontWeight="600" color="var(--ink)">
                  Zero-Shot Classification
                </Text>
              </HStack>
              <Text fontSize="13px" color="#4B5565" lineHeight="1.5">
                Multilingual NLI models (mDeBERTa-v3) categorize incidents into Medical, Fire, Traffic, and Crime classes with automated urgency scoring.
              </Text>
            </Box>

            <Box p={5} bg="var(--surface-alt)" border="1px solid var(--rule)" borderRadius="2px">
              <HStack spacing={3} mb={3}>
                <Icon as={FiMapPin} color="var(--accent)" w={4} h={4} />
                <Text fontSize="14px" fontWeight="600" color="var(--ink)">
                  India Geocoding & RTDB
                </Text>
              </HStack>
              <Text fontSize="13px" color="#4B5565" lineHeight="1.5">
                Region-biased Google Maps geocoding resolves addresses to coordinate pins and synchronizes live dispatcher tables via Firebase Realtime Database.
              </Text>
            </Box>
          </SimpleGrid>
        </VStack>

        <Divider my={12} borderColor="var(--rule)" />

        {/* Institutional ERSS Scope Note */}
        <Box p={6} border="1px solid var(--rule)" bg="var(--surface)" maxW="840px">
          <Text fontSize="14px" fontWeight="600" color="var(--ink)" mb={2}>
            Operational Context: Emergency Response Support System (ERSS - 112)
          </Text>
          <Text fontSize="13px" color="#4B5565" lineHeight="1.6">
            In India, 112 is the single emergency contact number integrating Police (100), Fire (101), Ambulance (108), and Disaster Management. RAKSHA112 models an AI co-pilot designed to reduce response latency by pre-populating verified incident records before dispatcher pickup.
          </Text>
        </Box>
      </Box>

      {/* Footer */}
      <Box borderTop="1px solid var(--rule)" px={{ base: 6, md: 12 }} py={6} mt={12} bg="var(--surface-alt)">
        <Flex justify="space-between" align="center" maxW="1200px" mx="auto" direction={{ base: 'column', md: 'row' }} gap={3}>
          <Text fontSize="12px" color="#5C6675">
            RAKSHA112 Emergency Triage Simulator • Academic Project Demo
          </Text>
          <Text fontSize="12px" color="#5C6675">
            Institutional Tooling — Authorized Operators Only
          </Text>
        </Flex>
      </Box>
    </Box>
  );
};
