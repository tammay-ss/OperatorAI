import React, { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  VStack,
  HStack,
  Text,
  Badge,
  Box,
  SimpleGrid,
  Icon,
  useToast,
  Progress,
  Flex,
} from '@chakra-ui/react';
import { FiPhoneCall, FiCpu, FiMapPin, FiPlay, FiCheckCircle } from 'react-icons/fi';
import { CallData } from '../types/calls';

interface SimulateCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCallProcessed?: (call: CallData) => void;
}

const PRESET_SCENARIOS = [
  {
    title: 'Chennai Central Accident',
    badge: 'Traffic Accident',
    colorScheme: 'yellow',
    callerName: 'Karthik Subramanian',
    phone: '+91 94440 67890',
    transcript: 'There has been a serious accident near Chennai Central. Two people are injured.',
  },
  {
    title: 'Tambaram Fire Emergency',
    badge: 'Fire Emergency',
    colorScheme: 'orange',
    callerName: 'Priya Narayanan',
    phone: '+91 98410 45678',
    transcript: 'There is a fire at 24 Gandhi Road, Tambaram. Thick smoke is coming from the ground floor.',
  },
  {
    title: 'Katpadi Medical Collapse',
    badge: 'Medical Emergency',
    colorScheme: 'red',
    callerName: 'Venkatesh Rao',
    phone: '+91 94432 11223',
    transcript: 'We are near the railway station in Katpadi. An elderly passenger collapsed and is unconscious.',
  },
  {
    title: 'VIT Chennai Main Gate',
    badge: 'Medical / Accident',
    colorScheme: 'purple',
    callerName: 'Anand Kumar',
    phone: '+91 98840 99887',
    transcript: "I'm at VIT Chennai near the main gate. A student was hit by a two-wheeler and needs an ambulance.",
  },
  {
    title: 'New Delhi Cardiac Surge',
    badge: 'Medical Emergency',
    colorScheme: 'red',
    callerName: 'Rajesh Sharma',
    phone: '+91 98101 23456',
    transcript: 'Hello, my name is Rajesh Sharma calling from Connaught Place in New Delhi. My colleague collapsed with severe chest pain!',
  },
];

export const SimulateCallModal: React.FC<SimulateCallModalProps> = ({
  isOpen,
  onClose,
  onCallProcessed,
}) => {
  const toast = useToast();
  const [callerName, setCallerName] = useState('Karthik Subramanian');
  const [phone, setPhone] = useState('+91 94440 67890');
  const [transcript, setTranscript] = useState(
    'There has been a serious accident near Chennai Central. Two people are injured.'
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<string>('idle');
  const [progressVal, setProgressVal] = useState(0);

  const handleSelectPreset = (preset: typeof PRESET_SCENARIOS[0]) => {
    setCallerName(preset.callerName);
    setPhone(preset.phone);
    setTranscript(preset.transcript);
  };

  const handleSimulate = async () => {
    if (!transcript.trim() || transcript.trim().length < 10) {
      toast({
        title: 'Transcript Required',
        description: 'Please provide at least 10 characters of emergency speech transcript.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsProcessing(true);
    setProgressVal(20);
    setStep('Transcribing Voice Stream...');

    try {
      setTimeout(() => {
        setProgressVal(50);
        setStep('Extracting Entities & Classifying Emergency...');
      }, 400);

      setTimeout(() => {
        setProgressVal(80);
        setStep('Normalizing Spoken Location & Geocoding Coordinates...');
      }, 800);

      const res = await fetch('/api/calls/demo-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callerName: callerName.trim() || 'Demo Caller',
          phone: phone.trim() || 'Demo Phone',
          transcript: transcript.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Server rejected demo call processing.');
      }

      const data = await res.json();
      setProgressVal(100);
      setStep('Incident Stored & Synchronized to Dispatch Map!');

      toast({
        title: 'Emergency Call Processed',
        description: `Created ticket ${data.callSid} at ${data.triage?.location || 'geocoded location'}.`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      if (onCallProcessed && data.triage) {
        onCallProcessed({ ...data.triage, callSid: data.callSid, key: data.callSid });
      }

      setTimeout(() => {
        setIsProcessing(false);
        setStep('idle');
        setProgressVal(0);
        onClose();
      }, 700);
    } catch (err: unknown) {
      const errObj = err as Error;
      setIsProcessing(false);
      setStep('idle');
      setProgressVal(0);
      toast({
        title: 'Processing Failed',
        description: errObj.message || 'Error executing AI pipeline.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(3px)" />
      <ModalContent borderRadius="4px" border="1px solid var(--rule)" bg="var(--surface)">
        <ModalHeader borderBottom="1px solid var(--rule)" py={3}>
          <HStack spacing={2}>
            <Icon as={FiPhoneCall} color="var(--accent)" />
            <Text fontSize="16px" fontWeight="600" color="var(--ink)">
              Simulate Inbound Emergency Call Intake
            </Text>
          </HStack>
          <Text fontSize="12px" color="#5C6675" fontWeight="400" mt={0.5}>
            Tests end-to-end voice transcript ingestion, NLP entity extraction, classification, location recognition from speech, and real-time dispatch map pin generation.
          </Text>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody py={4}>
          <VStack spacing={4} align="stretch">
            {/* Quick Scenario Selector */}
            <Box>
              <Text fontSize="12px" fontWeight="600" color="#5C6675" mb={2}>
                Quick Evaluation Scenarios:
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                {PRESET_SCENARIOS.map((p, idx) => (
                  <Box
                    key={idx}
                    p={2.5}
                    bg="var(--surface-alt)"
                    border="1px solid var(--rule)"
                    borderRadius="3px"
                    cursor="pointer"
                    _hover={{ borderColor: 'var(--accent)', bg: '#f8fafc' }}
                    onClick={() => handleSelectPreset(p)}
                  >
                    <Flex justify="space-between" align="center" mb={1}>
                      <Text fontSize="12px" fontWeight="600" color="var(--ink)">
                        {p.title}
                      </Text>
                      <Badge colorScheme={p.colorScheme} fontSize="9px">
                        {p.badge}
                      </Badge>
                    </Flex>
                    <Text fontSize="11px" color="#5C6675" noOfLines={1}>
                      &quot;{p.transcript}&quot;
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>

            {/* Caller Metadata */}
            <HStack spacing={3}>
              <FormControl flex={1}>
                <FormLabel fontSize="12px" fontWeight="500">
                  Caller Name
                </FormLabel>
                <Input
                  size="sm"
                  borderRadius="2px"
                  borderColor="var(--rule)"
                  value={callerName}
                  onChange={(e) => setCallerName(e.target.value)}
                />
              </FormControl>
              <FormControl flex={1}>
                <FormLabel fontSize="12px" fontWeight="500">
                  Phone Number
                </FormLabel>
                <Input
                  size="sm"
                  borderRadius="2px"
                  borderColor="var(--rule)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </FormControl>
            </HStack>

            {/* Spoken Transcript Input */}
            <FormControl isRequired>
              <Flex justify="space-between" align="center" mb={1}>
                <FormLabel fontSize="12px" fontWeight="500" mb={0}>
                  Spoken Emergency Call Transcript
                </FormLabel>
                <Badge fontSize="10px" colorScheme="purple">
                  Location will be recognized from speech
                </Badge>
              </Flex>
              <Textarea
                rows={3}
                fontSize="13px"
                borderRadius="2px"
                borderColor="var(--rule)"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="State emergency details, location in India (e.g. near Chennai Central, 24 Gandhi Road Tambaram), and victim count..."
              />
            </FormControl>

            {/* Pipeline progress bar */}
            {isProcessing && (
              <Box p={3} bg="#F0FDF4" border="1px solid #BBF7D0" borderRadius="3px">
                <Flex justify="space-between" align="center" mb={1}>
                  <Text fontSize="12px" fontWeight="600" color="#166534">
                    {step}
                  </Text>
                  <Text fontSize="11px" fontWeight="700" color="#166534">
                    {progressVal}%
                  </Text>
                </Flex>
                <Progress value={progressVal} size="xs" colorScheme="green" borderRadius="full" />
              </Box>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter borderTop="1px solid var(--rule)" py={3}>
          <HStack spacing={3}>
            <Button size="sm" variant="ghost" onClick={onClose} isDisabled={isProcessing}>
              Cancel
            </Button>
            <Button
              size="sm"
              bg="var(--accent)"
              color="white"
              _hover={{ bg: 'var(--accent-hover)' }}
              leftIcon={<FiPlay />}
              isLoading={isProcessing}
              loadingText="Processing Call Pipeline..."
              onClick={handleSimulate}
            >
              Simulate Call &amp; Dispatch to Map
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
