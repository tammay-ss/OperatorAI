import {
  SimpleGrid,
  Text,
  Box,
  Skeleton,
  Flex,
  Badge,
  Button,
  Icon,
  HStack,
  VStack,
  useDisclosure,
  useToast,
  Tag,
} from '@chakra-ui/react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  AiOutlinePhone,
  AiOutlineClockCircle,
  AiOutlineFolderOpen,
  AiOutlineAudio,
} from 'react-icons/ai';
import { BsCheck2Circle } from 'react-icons/bs';
import { FiLogOut, FiShield, FiUser, FiZap, FiDatabase, FiMapPin } from 'react-icons/fi';

import { useAuth } from '../context/AuthProvider';
import { CallData, STATUSES } from '../types/calls';
import { StatsCard } from './StatsCard';
import { DispatchMap } from './Maps/DispatchMap';
import CallsTable from './CallsTable';
import { FAQ } from './FAQ';
import { Footer } from './Footer';
import { RecordedCallUpload } from './RecordedCallUpload';
import { SimulateCallModal } from './SimulateCallModal';

export const Dashboard = ({
  calls: initialCalls,
  loading: initialLoading,
  error: rtdbError,
}: {
  calls: CallData[] | undefined;
  loading: boolean;
  error: Error | undefined;
}) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [statusFilter, setStatusFilter] = useState<keyof typeof STATUSES>();
  const [selectedRow, setSelectedRow] = useState<CallData>();
  const [backendIncidents, setBackendIncidents] = useState<CallData[]>([]);
  const [isLoadingBackend, setIsLoadingBackend] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  // Modals
  const { isOpen: isUploadOpen, onOpen: onUploadOpen, onClose: onUploadClose } = useDisclosure();
  const { isOpen: isSimulateOpen, onOpen: onSimulateOpen, onClose: onSimulateClose } = useDisclosure();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // Fetch incidents from backend on mount
  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch('/api/incidents');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.incidents || []);
        if (Array.isArray(list)) {
          setBackendIncidents(list);
        }
      }
    } catch (err) {
      console.warn('Could not fetch /api/incidents:', err);
    } finally {
      setIsLoadingBackend(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();

    // Subscribe to backend real-time Server-Sent Events stream
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/incidents/stream');

      eventSource.addEventListener('incident_created', (e) => {
        try {
          const newIncident: CallData = JSON.parse(e.data);
          setBackendIncidents((prev) => {
            const exists = prev.some(
              (p) =>
                p.callSid === newIncident.callSid ||
                (newIncident.incident_id && p.incident_id === newIncident.incident_id)
            );
            if (exists) {
              return prev.map((p) =>
                p.callSid === newIncident.callSid ||
                (newIncident.incident_id && p.incident_id === newIncident.incident_id)
                  ? { ...p, ...newIncident }
                  : p
              );
            }
            return [newIncident, ...prev];
          });

          toast({
            title: `🚨 New Emergency: ${newIncident.incident_id || 'INC-NEW'}`,
            description: `${newIncident.emergency || 'Incident'} reported at ${
              newIncident.location_text || newIncident.address || 'Location Identified'
            }`,
            status: newIncident.priority === 'HIGH' ? 'error' : 'warning',
            duration: 6000,
            isClosable: true,
            position: 'top-right',
          });
        } catch (err) {
          console.error('Error parsing SSE incident_created:', err);
        }
      });

      eventSource.addEventListener('incident_updated', (e) => {
        try {
          const updated: { callSid: string; status: string; priority?: string; dateResolved?: string } =
            JSON.parse(e.data);
          setBackendIncidents((prev) =>
            prev.map((item) => {
              if (item.callSid === updated.callSid || item.incident_id === updated.callSid) {
                return {
                  ...item,
                  status: updated.status as any,
                  ...(updated.priority ? { priority: updated.priority as any } : {}),
                  ...(updated.dateResolved ? { dateResolved: updated.dateResolved } : {}),
                };
              }
              return item;
            })
          );
        } catch (err) {
          console.error('Error parsing SSE incident_updated:', err);
        }
      });

      eventSource.onerror = () => {
        // SSE will auto-reconnect
      };
    } catch (e) {
      console.warn('SSE initialization error:', e);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [fetchIncidents, toast]);

  // Merge initialCalls (from Firebase RTDB) with backendIncidents
  const effectiveCalls: CallData[] = useMemo(() => {
    const map = new Map<string, CallData>();

    // 1. Add Firebase calls
    if (initialCalls && Array.isArray(initialCalls)) {
      initialCalls.forEach((c) => {
        const id = c.callSid || c.key || c.incident_id;
        if (id) {
          map.set(id, { ...c, key: id });
        }
      });
    }

    // 2. Add/merge backend calls (overrides or supplements)
    backendIncidents.forEach((c) => {
      const id = c.callSid || c.key || c.incident_id;
      if (id) {
        const existing = map.get(id);
        map.set(id, {
          ...existing,
          ...c,
          key: id,
          // Ensure coordinates & location fields are preserved
          location_text: c.location_text || existing?.location_text || c.address || existing?.address,
          latitude: c.latitude ?? existing?.latitude ?? c.geocode?.lat ?? existing?.geocode?.lat,
          longitude: c.longitude ?? existing?.longitude ?? c.geocode?.lng ?? existing?.geocode?.lng,
          location_source: c.location_source || existing?.location_source || 'caller_statement',
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.dateCreated || a.timestamp || 0).getTime();
      const timeB = new Date(b.dateCreated || b.timestamp || 0).getTime();
      return timeB - timeA;
    });
  }, [initialCalls, backendIncidents]);

  const handleClick = (call: CallData) => {
    setSelectedRow(call);
  };

  const handleStatusChange = async (callSid: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/incidents/${callSid}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        // Optimistically update local state
        setBackendIncidents((prev) =>
          prev.map((c) => {
            if (c.callSid === callSid || c.incident_id === callSid) {
              return {
                ...c,
                status: newStatus as any,
                ...(newStatus === 'RESOLVED' ? { dateResolved: new Date().toISOString() } : {}),
              };
            }
            return c;
          })
        );

        if (selectedRow?.callSid === callSid || selectedRow?.incident_id === callSid) {
          setSelectedRow((prev) =>
            prev
              ? {
                  ...prev,
                  status: newStatus as any,
                  ...(newStatus === 'RESOLVED' ? { dateResolved: new Date().toISOString() } : {}),
                }
              : prev
          );
        }

        toast({
          title: `Incident ${newStatus}`,
          description: `Incident status updated to ${newStatus}. Map updated.`,
          status: newStatus === 'RESOLVED' ? 'info' : 'success',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (err) {
      console.error('Failed to update incident status:', err);
    }
  };

  const handleCallProcessed = (callSid: string) => {
    fetchIncidents();
    setTimeout(() => {
      document.querySelector('#calls-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
  };

  // Seed evaluation scenarios
  const handleSeedScenarios = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/incidents/seed', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchIncidents();
        toast({
          title: '🌱 Evaluation Scenarios Seeded',
          description: `Seeded ${data.seeded?.length || 7} realistic Indian emergency incidents across Chennai Central, Tambaram, Katpadi, Delhi, Mumbai, Bengaluru.`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      } else {
        throw new Error(data.error || 'Seed failed');
      }
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      toast({
        title: 'Seed Error',
        description: errObj.message || 'Failed to seed scenarios.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setIsSeeding(false);
    }
  };

  // Loading skeleton when both initialCalls and backendIncidents are not ready
  if (initialLoading && isLoadingBackend && effectiveCalls.length === 0) {
    return (
      <Box minH="100vh" bg="var(--surface)" p={{ base: 4, md: 8 }}>
        <Box maxW="1400px" mx="auto">
          <Flex justifyContent="space-between" mb={6}>
            <Skeleton w="240px" h="40px" borderRadius="2px" />
            <Skeleton w="180px" h="40px" borderRadius="2px" />
          </Flex>
          <SimpleGrid columns={{ base: 2, lg: 4 }} spacing={4} mb={6}>
            <Skeleton h="70px" borderRadius="2px" />
            <Skeleton h="70px" borderRadius="2px" />
            <Skeleton h="70px" borderRadius="2px" />
            <Skeleton h="70px" borderRadius="2px" />
          </SimpleGrid>
          <Skeleton h="350px" borderRadius="2px" mb={6} />
          <Skeleton h="300px" borderRadius="2px" />
        </Box>
      </Box>
    );
  }

  // Triage categorisation
  const unresolved = effectiveCalls.filter((call) => call.status !== STATUSES.RESOLVED.key);
  const open = effectiveCalls.filter((call) => call.status === STATUSES.OPEN.key);
  const dispatched = effectiveCalls.filter((call) => call.status === STATUSES.DISPATCHED.key);
  const resolved = effectiveCalls.filter((call) => call.status === STATUSES.RESOLVED.key);

  const filteredCalls = statusFilter
    ? effectiveCalls.filter((c) => c.status === statusFilter)
    : unresolved;

  return (
    <Box minH="100vh" bg="var(--surface)" color="var(--ink)">
      {/* Top Operational Header Bar with Operator Identity & Controls */}
      <Box borderBottom="1px solid var(--rule)" px={{ base: 4, md: 8 }} py={3} bg="var(--surface)">
        <Flex maxW="1400px" mx="auto" justify="space-between" align="center" wrap="wrap" gap={3}>
          <HStack spacing={3}>
            <Icon as={FiShield} w={5} h={5} color="var(--accent)" />
            <Text fontWeight="700" fontSize="16px" color="var(--ink)" letterSpacing="-0.02em">
              OPERATORAI <Text as="span" color="var(--accent)" fontSize="13px" fontWeight="600">RAKSHA112</Text>
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
              ERSS-112 Real-Time Dispatch Console
            </Badge>
          </HStack>

          <HStack spacing={3} wrap="wrap">
            <HStack
              spacing={2}
              px={3}
              py={1.5}
              bg="var(--surface-alt)"
              border="1px solid var(--rule)"
              borderRadius="2px"
            >
              <Icon as={FiUser} w={3.5} h={3.5} color="var(--accent)" />
              <Text fontSize="12px" color="var(--ink)" fontWeight="500">
                {user?.email || 'Authorized Operator'}
              </Text>
            </HStack>

            {/* Incident Records & Analytics Page Navigation */}
            <Button
              as={RouterLink}
              to="/incidents"
              size="sm"
              variant="outline"
              borderColor="var(--rule)"
              borderRadius="2px"
              fontSize="12px"
              fontWeight="600"
              color="var(--ink)"
              _hover={{ bg: 'var(--surface-alt)' }}
            >
              📋 Incident Registry & Analytics
            </Button>

            {/* Quick Inbound Emergency Simulation */}
            <Button
              leftIcon={<Icon as={FiZap} />}
              size="sm"
              bg="var(--accent)"
              color="white"
              _hover={{ bg: 'var(--accent-hover)' }}
              borderRadius="2px"
              fontSize="12px"
              fontWeight="600"
              onClick={onSimulateOpen}
            >
              ⚡ Simulate Inbound Call
            </Button>

            {/* Seed Realistic Scenarios */}
            <Button
              leftIcon={<Icon as={FiDatabase} />}
              size="sm"
              variant="outline"
              borderColor="var(--rule)"
              borderRadius="2px"
              fontSize="12px"
              fontWeight="500"
              color="var(--ink)"
              _hover={{ bg: 'var(--surface-alt)' }}
              isLoading={isSeeding}
              loadingText="Seeding..."
              onClick={handleSeedScenarios}
            >
              🌱 Seed Scenarios
            </Button>

            {/* Audio Upload */}
            <Button
              leftIcon={<Icon as={AiOutlineAudio} />}
              size="sm"
              variant="outline"
              borderColor="var(--rule)"
              borderRadius="2px"
              fontSize="12px"
              fontWeight="500"
              color="var(--ink)"
              _hover={{ bg: 'var(--surface-alt)' }}
              onClick={onUploadOpen}
            >
              Upload Audio
            </Button>

            {/* Sign Out */}
            <Button
              leftIcon={<Icon as={FiLogOut} />}
              size="sm"
              variant="ghost"
              borderRadius="2px"
              fontSize="12px"
              fontWeight="500"
              color="#5C6675"
              _hover={{ bg: 'var(--surface-alt)', color: 'red.600' }}
              onClick={handleSignOut}
            >
              Sign Out
            </Button>
          </HStack>
        </Flex>
      </Box>

      {/* Real-time Status Banner */}
      <Box bg="#F0F9FF" borderBottom="1px solid #BAE6FD" px={{ base: 4, md: 8 }} py={2}>
        <Box maxW="1400px" mx="auto">
          <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
            <HStack spacing={2}>
              <Box w="8px" h="8px" borderRadius="full" bg="green.500" />
              <Text fontSize="12px" color="#0369A1" fontWeight="600">
                ACTIVE AI PIPELINE:
              </Text>
              <Text fontSize="12px" color="#0284C7">
                Speech-to-Text &rarr; Indic NLP Entity Recognition &rarr; Spoken Location Extraction &rarr; OpenStreetMap Geocoding &rarr; Real-Time Dispatch Map
              </Text>
            </HStack>
            <HStack spacing={2}>
              <Tag size="sm" colorScheme="blue" variant="subtle" fontSize="11px">
                OpenStreetMap + Leaflet (Zero-Billing)
              </Tag>
              <Tag size="sm" colorScheme="purple" variant="subtle" fontSize="11px">
                Spoken Caller Location Extraction
              </Tag>
            </HStack>
          </Flex>
        </Box>
      </Box>

      {/* Main Operational Container */}
      <Box maxW="1400px" mx="auto" px={{ base: 4, md: 8 }} py={6}>
        {rtdbError && (
          <Box mb={4} p={3} bg="#FEF3C7" border="1px solid #FDE68A" borderRadius="2px">
            <Text fontSize="12px" color="#92400E">
              Notice: Backend live stream active. Firebase Auth is in academic demo mode. Live data streams continuously through backend SSE.
            </Text>
          </Box>
        )}

        {/* Triage Status Summary Bar */}
        <SimpleGrid columns={{ base: 2, lg: 4 }} spacing={4} mb={6}>
          <StatsCard
            active={!statusFilter}
            title="Unresolved Incident Queue"
            stat={unresolved.length.toString()}
            icon={<AiOutlinePhone size="18px" />}
            onClick={() => setStatusFilter(undefined)}
          />
          <StatsCard
            active={statusFilter === STATUSES.OPEN.key}
            title="Open / In Triage"
            stat={open.length.toString()}
            icon={<AiOutlineFolderOpen size="18px" />}
            onClick={() => setStatusFilter(STATUSES.OPEN.key)}
          />
          <StatsCard
            active={statusFilter === STATUSES.DISPATCHED.key}
            title="Units Dispatched"
            stat={dispatched.length.toString()}
            icon={<AiOutlineClockCircle size="18px" />}
            onClick={() => setStatusFilter(STATUSES.DISPATCHED.key)}
          />
          <StatsCard
            active={statusFilter === STATUSES.RESOLVED.key}
            title="Resolved Incidents"
            stat={resolved.length.toString()}
            icon={<BsCheck2Circle size="18px" />}
            onClick={() => setStatusFilter(STATUSES.RESOLVED.key)}
          />
        </SimpleGrid>

        {/* Geographic Incident Map (Interactive Leaflet + OpenStreetMap) */}
        <Box mb={8}>
          <DispatchMap
            calls={effectiveCalls}
            selectedCall={selectedRow}
            onSelectCall={handleClick}
            onStatusChange={handleStatusChange}
          />

          {/* Selected Incident Spoken Location Detail Panel */}
          {selectedRow && (
            <Box
              mt={3}
              p={4}
              bg="var(--surface-alt)"
              border="1px solid var(--rule)"
              borderRadius="4px"
            >
              <Flex justify="space-between" align="center" wrap="wrap" gap={2} mb={3}>
                <HStack spacing={2}>
                  <Icon as={FiMapPin} color="var(--accent)" />
                  <Text fontSize="13px" fontWeight="700" color="var(--ink)">
                    Spoken Caller Location & AI Geocoding Analysis
                  </Text>
                  <Badge colorScheme="blue" fontSize="10px">
                    {selectedRow.incident_id || selectedRow.callSid}
                  </Badge>
                </HStack>
                <HStack spacing={2}>
                  <Badge
                    colorScheme={
                      selectedRow.status === 'OPEN'
                        ? 'red'
                        : selectedRow.status === 'DISPATCHED'
                        ? 'orange'
                        : 'green'
                    }
                    fontSize="11px"
                  >
                    {selectedRow.status}
                  </Badge>
                  <Badge colorScheme="purple" fontSize="11px">
                    Source: {selectedRow.location_source || 'caller_statement'}
                  </Badge>
                </HStack>
              </Flex>

              <SimpleGrid columns={{ base: 2, md: 5 }} spacing={4}>
                <Box>
                  <Text fontSize="11px" color="#5C6675">Recognized Spoken Location</Text>
                  <Text fontSize="13px" fontWeight="600" color="var(--ink)">
                    {selectedRow.location_text || selectedRow.entities?.location || selectedRow.address || 'Location Identified'}
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="11px" color="#5C6675">Geocoded Coordinates</Text>
                  <Text fontSize="13px" fontWeight="600" fontFamily="mono" color="var(--ink)">
                    {selectedRow.latitude !== undefined && selectedRow.longitude !== undefined
                      ? `${selectedRow.latitude.toFixed(4)}°N, ${selectedRow.longitude.toFixed(4)}°E`
                      : selectedRow.geocode
                      ? `${selectedRow.geocode.lat.toFixed(4)}°N, ${selectedRow.geocode.lng.toFixed(4)}°E`
                      : 'Pending Geocode'}
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="11px" color="#5C6675">Reported Victims / Casualties</Text>
                  <Text fontSize="13px" fontWeight="600" color="red.600">
                    {selectedRow.entities?.victims || selectedRow.victims || '0'} victim(s)
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="11px" color="#5C6675">Reported Injuries / Symptoms</Text>
                  <Text fontSize="13px" fontWeight="600" color="var(--ink)">
                    {(selectedRow.entities?.injuries && selectedRow.entities.injuries.length > 0)
                      ? selectedRow.entities?.injuries?.join(', ')
                      : 'None stated'}
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="11px" color="#5C6675">Emergency Category</Text>
                  <Text fontSize="13px" fontWeight="600" color="var(--accent)">
                    {selectedRow.emergency || selectedRow.emergency_type || 'Unclassified'}
                  </Text>
                </Box>
              </SimpleGrid>
            </Box>
          )}
        </Box>

        {/* Calls Feed Section */}
        <Box id="calls-section" mb={8}>
          <Flex justify="space-between" align="center" mb={3}>
            <HStack spacing={2}>
              <Text fontSize="15px" fontWeight="600" color="var(--ink)">
                Active Call Intake & Automated Triage Stream
              </Text>
              <Badge colorScheme="blue" fontSize="11px">
                {filteredCalls.length} visible
              </Badge>
            </HStack>
            <Text fontSize="12px" color="#5C6675">
              Showing {filteredCalls.length} of {effectiveCalls.length} total incidents
            </Text>
          </Flex>

          <CallsTable
            selectedRowKey={selectedRow?.key || selectedRow?.callSid || selectedRow?.incident_id}
            onRowClick={handleClick}
            calls={filteredCalls}
            onStatusChange={handleStatusChange}
          />
        </Box>

        {/* Operational Specifications & FAQ */}
        <FAQ />
      </Box>

      {/* Footer */}
      <Footer />

      {/* Interactive Inbound Call Simulation Modal */}
      <SimulateCallModal
        isOpen={isSimulateOpen}
        onClose={onSimulateClose}
        onCallProcessed={(call) => handleCallProcessed(call.callSid)}
      />

      {/* Recorded Call Upload Modal */}
      <RecordedCallUpload
        isOpen={isUploadOpen}
        onClose={onUploadClose}
        onCallProcessed={handleCallProcessed}
      />
    </Box>
  );
};
