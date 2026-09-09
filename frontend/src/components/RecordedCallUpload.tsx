import React, { useState, useRef } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Text,
  VStack,
  HStack,
  Flex,
  Badge,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Progress,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Icon,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Spinner,
  Divider,
} from '@chakra-ui/react';
import { FiUploadCloud, FiFile, FiCheckCircle } from 'react-icons/fi';
import { AiOutlineAudio } from 'react-icons/ai';

interface RecordedCallUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onCallProcessed?: (callSid: string) => void;
}

type ProcessingStep = 'idle' | 'queued' | 'uploading' | 'transcribing' | 'analyzing' | 'completed' | 'error';

interface JobStatusResponse {
  jobId: string;
  callSid: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  step: ProcessingStep;
  duration?: number;
  error?: string;
  result?: {
    callSid: string;
    transcript: string;
    duration: number;
    triage?: {
      name?: string;
      location?: string;
      emergency?: string;
      priority?: string;
      geocode?: { lat: number; lng: number };
    };
  };
}

const STEP_DETAILS: Record<ProcessingStep, { label: string; progress: number; description: string }> = {
  idle: { label: 'Ready', progress: 0, description: 'Select an audio file to begin' },
  queued: { label: 'Queued', progress: 15, description: 'Validating file format and audio duration...' },
  uploading: { label: 'Uploading', progress: 35, description: 'Sending audio buffer to AssemblyAI async API...' },
  transcribing: {
    label: 'Transcribing',
    progress: 65,
    description: 'Generating accurate speech-to-text transcript...',
  },
  analyzing: {
    label: 'AI Triage & Geocoding',
    progress: 85,
    description: 'Running IndicNER, mDeBERTa classification, and India geocoding...',
  },
  completed: {
    label: 'Triage Completed',
    progress: 100,
    description: 'Successfully synchronized to ERSS-112 live dispatch feed!',
  },
  error: { label: 'Processing Failed', progress: 100, description: 'An error occurred during intake.' },
};

export const RecordedCallUpload: React.FC<RecordedCallUploadProps> = ({ isOpen, onClose, onCallProcessed }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [callerLabel, setCallerLabel] = useState<string>('');
  const [step, setStep] = useState<ProcessingStep>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<JobStatusResponse['result'] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setSelectedFile(null);
    setCallerLabel('');
    setStep('idle');
    setErrorMessage(null);
    setJobResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (step === 'completed' && jobResult?.callSid && onCallProcessed) {
      onCallProcessed(jobResult.callSid);
    }
    resetState();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Check client-side file size (15MB)
    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage(
        `Selected file is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed is 15MB.`
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    if (!callerLabel) {
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setCallerLabel(fileNameWithoutExt);
    }
  };

  const startPollingJob = async (jobId: string) => {
    const pollInterval = 1200;
    const maxAttempts = 60; // 60 * 1.2s = 72s max
    let attempts = 0;

    const poll = async () => {
      attempts++;
      try {
        const response = await fetch(`/api/calls/upload-status/${jobId}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to check upload status.');
        }

        const data: JobStatusResponse = await response.json();

        if (data.step) {
          setStep(data.step);
        }

        if (data.status === 'completed') {
          setStep('completed');
          setJobResult(data.result || null);
          if (data.result?.callSid && onCallProcessed) {
            onCallProcessed(data.result.callSid);
          }
          return;
        }

        if (data.status === 'error') {
          setStep('error');
          setErrorMessage(data.error || 'Transcription or triage processing failed.');
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        } else {
          setStep('error');
          setErrorMessage('Processing timed out after 70 seconds. Please try again.');
        }
      } catch (err: unknown) {
        const errorObj = err as { message?: string };
        setStep('error');
        setErrorMessage(errorObj.message || 'Error checking processing status.');
      }
    };

    setTimeout(poll, 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage('Please select a valid audio file (.wav, .mp3, .m4a, .ogg).');
      return;
    }

    setStep('queued');
    setErrorMessage(null);
    setJobResult(null);

    const formData = new FormData();
    formData.append('audio', selectedFile);
    if (callerLabel.trim()) {
      formData.append('callerLabel', callerLabel.trim());
    }

    try {
      const response = await fetch('/api/calls/upload-audio', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Upload failed. Please check the audio file.');
      }

      // Start async status polling
      startPollingJob(data.jobId);
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setStep('error');
      setErrorMessage(errorObj.message || 'Network error while uploading audio file.');
    }
  };

  const isProcessing = ['queued', 'uploading', 'transcribing', 'analyzing'].includes(step);

  return (
    <Modal isOpen={isOpen} onClose={isProcessing ? () => undefined : handleClose} size="xl" isCentered>
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent borderRadius="2xl" shadow="2xl" overflow="hidden">
        <ModalHeader bg="gray.50" borderBottom="1px solid" borderColor="blackAlpha.100" pb={3}>
          <Flex alignItems="center" justifyContent="space-between">
            <HStack spacing={3}>
              <Icon as={AiOutlineAudio} w={6} h={6} color="purple.600" />
              <Box>
                <Text fontSize="lg" fontWeight="bold">
                  Recorded Audio Intake
                </Text>
                <Text fontSize="xs" color="gray.500" fontWeight="normal">
                  Demo fallback for evaluators (bypasses Twilio live line)
                </Text>
              </Box>
            </HStack>
            <Badge colorScheme="purple" variant="subtle" px={2} py={1} borderRadius="md">
              Async Fallback Pipeline
            </Badge>
          </Flex>
        </ModalHeader>
        {!isProcessing && <ModalCloseButton />}

        <ModalBody py={6}>
          <VStack spacing={5} align="stretch">
            {errorMessage && (
              <Alert status="error" borderRadius="xl">
                <AlertIcon />
                <Box>
                  <AlertTitle fontSize="sm">Upload Rejected</AlertTitle>
                  <AlertDescription fontSize="xs">{errorMessage}</AlertDescription>
                </Box>
              </Alert>
            )}

            {step === 'completed' && jobResult ? (
              <Alert
                status="success"
                variant="subtle"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                textAlign="center"
                borderRadius="2xl"
                p={6}
                bg="green.50"
                border="1px solid"
                borderColor="green.200"
              >
                <Icon as={FiCheckCircle} w={12} h={12} color="green.500" mb={3} />
                <AlertTitle fontSize="lg" mb={1} color="green.800">
                  Call Triaged & Logged Successfully!
                </AlertTitle>
                <AlertDescription fontSize="sm" color="gray.600" mb={4}>
                  The recorded audio has been transcribed, analyzed by IndicNER and mDeBERTa, and pushed to the live
                  ERSS dispatcher table.
                </AlertDescription>

                <Box
                  w="full"
                  bg="white"
                  p={4}
                  borderRadius="xl"
                  border="1px solid"
                  borderColor="green.100"
                  textAlign="left"
                  mb={4}
                >
                  <Flex justify="space-between" mb={2}>
                    <Text fontSize="xs" fontWeight="bold" color="gray.500">
                      CALL SID
                    </Text>
                    <Badge colorScheme="purple">{jobResult.callSid}</Badge>
                  </Flex>
                  {jobResult.triage?.name && (
                    <Flex justify="space-between" mb={1}>
                      <Text fontSize="xs" color="gray.500">
                        Caller Name:
                      </Text>
                      <Text fontSize="xs" fontWeight="bold">
                        {jobResult.triage.name}
                      </Text>
                    </Flex>
                  )}
                  {jobResult.triage?.location && (
                    <Flex justify="space-between" mb={1}>
                      <Text fontSize="xs" color="gray.500">
                        Extracted Location:
                      </Text>
                      <Text fontSize="xs" fontWeight="bold">
                        {jobResult.triage.location}
                      </Text>
                    </Flex>
                  )}
                  {jobResult.triage?.emergency && (
                    <Flex justify="space-between" mb={1}>
                      <Text fontSize="xs" color="gray.500">
                        Emergency Classification:
                      </Text>
                      <Badge colorScheme="orange">{jobResult.triage.emergency}</Badge>
                    </Flex>
                  )}
                  {jobResult.triage?.priority && (
                    <Flex justify="space-between" mb={1}>
                      <Text fontSize="xs" color="gray.500">
                        Priority Level:
                      </Text>
                      <Badge colorScheme={jobResult.triage.priority === 'HIGH' ? 'red' : 'yellow'}>
                        {jobResult.triage.priority}
                      </Badge>
                    </Flex>
                  )}
                  <Divider my={2} />
                  <Text fontSize="xs" color="gray.500" fontWeight="bold" mb={1}>
                    Transcript Preview:
                  </Text>
                  <Text fontSize="xs" fontStyle="italic" color="gray.700" noOfLines={3}>
                    &ldquo;{jobResult.transcript}&rdquo;
                  </Text>
                </Box>
              </Alert>
            ) : isProcessing ? (
              <Box p={6} bg="purple.50" borderRadius="2xl" border="1px solid" borderColor="purple.100">
                <VStack spacing={4} align="stretch">
                  <Flex justify="space-between" align="center">
                    <HStack spacing={2}>
                      <Spinner size="sm" color="purple.600" />
                      <Text fontWeight="bold" fontSize="sm" color="purple.900">
                        {STEP_DETAILS[step].label}
                      </Text>
                    </HStack>
                    <Badge colorScheme="purple">{STEP_DETAILS[step].progress}%</Badge>
                  </Flex>

                  <Progress
                    value={STEP_DETAILS[step].progress}
                    size="sm"
                    colorScheme="purple"
                    borderRadius="full"
                    hasStripe
                    isAnimated
                  />

                  <Text fontSize="xs" color="purple.700">
                    {STEP_DETAILS[step].description}
                  </Text>

                  <Box bg="white" p={3} borderRadius="lg" fontSize="xs" color="gray.600">
                    <Text>
                      <strong>File:</strong> {selectedFile?.name} (
                      {selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(2) : 0} MB)
                    </Text>
                    {callerLabel && (
                      <Text>
                        <strong>Caller:</strong> {callerLabel}
                      </Text>
                    )}
                  </Box>
                </VStack>
              </Box>
            ) : (
              <form onSubmit={handleSubmit}>
                <VStack spacing={4} align="stretch">
                  <FormControl isRequired>
                    <FormLabel fontSize="sm" fontWeight="bold">
                      Select Audio Recording (.wav, .mp3, .m4a, .ogg)
                    </FormLabel>
                    <Box
                      border="2px dashed"
                      borderColor={selectedFile ? 'purple.400' : 'gray.300'}
                      bg={selectedFile ? 'purple.50' : 'gray.50'}
                      borderRadius="xl"
                      p={5}
                      textAlign="center"
                      cursor="pointer"
                      _hover={{ borderColor: 'purple.500', bg: 'purple.50' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".wav,.mp3,.m4a,.ogg,audio/*"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                      />
                      <Icon
                        as={selectedFile ? FiFile : FiUploadCloud}
                        w={8}
                        h={8}
                        color={selectedFile ? 'purple.600' : 'gray.400'}
                        mb={2}
                      />
                      {selectedFile ? (
                        <Box>
                          <Text fontWeight="bold" fontSize="sm" color="purple.900">
                            {selectedFile.name}
                          </Text>
                          <Text fontSize="xs" color="purple.600">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to transcribe
                          </Text>
                        </Box>
                      ) : (
                        <Box>
                          <Text fontWeight="medium" fontSize="sm" color="gray.700">
                            Click to browse or drop recorded emergency audio
                          </Text>
                          <Text fontSize="xs" color="gray.500" mt={1}>
                            Supported: WAV, MP3, M4A, OGG • Max size: 15MB • Max duration: 5 mins
                          </Text>
                        </Box>
                      )}
                    </Box>
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="sm" fontWeight="bold">
                      Caller Label / Scenario Title (Optional)
                    </FormLabel>
                    <Input
                      placeholder="e.g. Rajesh Sharma (Scenario 1)"
                      value={callerLabel}
                      onChange={(e) => setCallerLabel(e.target.value)}
                      borderRadius="lg"
                    />
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      If the audio doesn&apos;t state a name clearly, this label will be used as the fallback caller
                      name.
                    </Text>
                  </FormControl>

                  {/* Sample Scenarios Accordion */}
                  <Accordion allowToggle>
                    <AccordionItem border="1px solid" borderColor="blackAlpha.100" borderRadius="xl">
                      <h2>
                        <AccordionButton py={2} bg="gray.50" borderRadius="xl">
                          <Box as="span" flex="1" textAlign="left" fontSize="xs" fontWeight="bold" color="gray.600">
                            💡 View Sample Test Scenarios (Scripts for Recording)
                          </Box>
                          <AccordionIcon />
                        </AccordionButton>
                      </h2>
                      <AccordionPanel pb={3} fontSize="xs" color="gray.600">
                        <VStack spacing={2} align="stretch">
                          <Box bg="blue.50" p={2} borderRadius="md" borderLeft="3px solid" borderColor="blue.500">
                            <Text fontWeight="bold" color="blue.800">
                              Scenario 1: Medical Emergency (High Priority)
                            </Text>
                            <Text fontStyle="italic" mt={1}>
                              &ldquo;Hello, my name is Rajesh Sharma. I am calling from Connaught Place, Inner Circle in
                              New Delhi. My colleague suddenly collapsed with severe chest pain and breathlessness. We
                              need an ambulance immediately!&rdquo;
                            </Text>
                          </Box>

                          <Box bg="orange.50" p={2} borderRadius="md" borderLeft="3px solid" borderColor="orange.500">
                            <Text fontWeight="bold" color="orange.800">
                              Scenario 2: Fire Emergency (High Priority)
                            </Text>
                            <Text fontStyle="italic" mt={1}>
                              &ldquo;Please help, this is Sunita Verma at Atta Market, Sector 18 Noida. An LPG gas
                              cylinder caught fire in a restaurant kitchen and black smoke is spreading rapidly. Send
                              fire engines!&rdquo;
                            </Text>
                          </Box>

                          <Box bg="yellow.50" p={2} borderRadius="md" borderLeft="3px solid" borderColor="yellow.500">
                            <Text fontWeight="bold" color="yellow.800">
                              Scenario 3: Traffic Accident (Medium Priority)
                            </Text>
                            <Text fontStyle="italic" mt={1}>
                              &ldquo;This is Amit Patel near Western Express Highway, Andheri East Mumbai. Two cars
                              collided and traffic is blocked. Send traffic police and medical assistance.&rdquo;
                            </Text>
                          </Box>
                        </VStack>
                      </AccordionPanel>
                    </AccordionItem>
                  </Accordion>
                </VStack>
              </form>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter bg="gray.50" borderTop="1px solid" borderColor="blackAlpha.100">
          {step === 'completed' ? (
            <Button colorScheme="purple" onClick={handleClose} w="full" borderRadius="xl">
              View Call on Dashboard
            </Button>
          ) : (
            <HStack spacing={3} w="full" justify="flex-end">
              <Button variant="ghost" onClick={handleClose} isDisabled={isProcessing} borderRadius="xl">
                Cancel
              </Button>
              <Button
                colorScheme="purple"
                onClick={handleSubmit}
                isLoading={isProcessing}
                loadingText={STEP_DETAILS[step].label}
                isDisabled={!selectedFile || isProcessing}
                borderRadius="xl"
                leftIcon={<Icon as={FiUploadCloud} />}
              >
                Upload & Triage
              </Button>
            </HStack>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
