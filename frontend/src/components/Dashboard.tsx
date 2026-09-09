import { SimpleGrid, Text, Box, Skeleton, Flex, Badge, Button, Icon, HStack, useDisclosure } from '@chakra-ui/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrapper, Status } from '@googlemaps/react-wrapper';
import { AiOutlinePhone, AiOutlineClockCircle, AiOutlineFolderOpen, AiOutlineAudio } from 'react-icons/ai';
import { BsCheck2Circle } from 'react-icons/bs';
import { FiLogOut, FiShield, FiUser } from 'react-icons/fi';

import { useAuth } from '../context/AuthProvider';
import { CallData, PRIORITIES, STATUSES } from '../types/calls';
import { StatsCard } from './StatsCard';
import { Map } from './Maps/Map';
import { Marker } from './Maps/Marker';
import CallsTable from './CallsTable';
import { FAQ } from './FAQ';
import { Footer } from './Footer';
import { RecordedCallUpload } from './RecordedCallUpload';

export const Dashboard = ({
  calls,
  loading,
  error,
}: {
  calls: CallData[] | undefined;
  loading: boolean;
  error: Error | undefined;
}) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<keyof typeof STATUSES>();
  const [selectedRow, setSelectedRow] = useState<CallData>();
  const { isOpen: isUploadOpen, onOpen: onUploadOpen, onClose: onUploadClose } = useDisclosure();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleClick = async (call: CallData) => {
    setSelectedRow(call);
  };

  const handleCallProcessed = (callSid: string) => {
    if (calls) {
      const match = calls.find((c) => c.callSid === callSid);
      if (match) {
        setSelectedRow(match);
      }
    }
    setTimeout(() => {
      document.querySelector('#calls-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
  };

  const render = (status: Status) => {
    return <h1>{status}</h1>;
  };

  if (!calls || loading) {
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

  const unresolved = calls.filter((call) => call.status !== STATUSES.RESOLVED.key);
  const open = calls.filter((call) => call.status === STATUSES.OPEN.key);
  const dispatched = calls.filter((call) => call.status === STATUSES.DISPATCHED.key);
  const resolved = calls.filter((call) => call.status === STATUSES.RESOLVED.key);

  const filterCallsBasedOnStatus = (statusKey: keyof typeof STATUSES | undefined) => {
    switch (statusKey) {
      case STATUSES.OPEN.key:
        return open;
      case STATUSES.DISPATCHED.key:
        return dispatched;
      case STATUSES.RESOLVED.key:
        return resolved;
      default:
        return unresolved;
    }
  };

  const filteredCalls = filterCallsBasedOnStatus(status);

  return (
    <Box minH="100vh" bg="var(--surface)" color="var(--ink)">
      {/* Top Operational Header Bar with Operator Identity & Sign Out */}
      <Box borderBottom="1px solid var(--rule)" px={{ base: 4, md: 8 }} py={3} bg="var(--surface)">
        <Flex maxW="1400px" mx="auto" justify="space-between" align="center" wrap="wrap" gap={3}>
          <HStack spacing={3}>
            <Icon as={FiShield} w={5} h={5} color="var(--accent)" />
            <Text fontWeight="600" fontSize="16px" color="var(--ink)">
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
              ERSS-112 Dispatcher Console
            </Badge>
          </HStack>

          <HStack spacing={4}>
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

            <Button
              leftIcon={<Icon as={AiOutlineAudio} />}
              size="sm"
              bg="var(--accent)"
              color="white"
              _hover={{ bg: 'var(--accent-hover)' }}
              borderRadius="2px"
              fontSize="12px"
              fontWeight="500"
              onClick={onUploadOpen}
            >
              Upload Recorded Call (Demo)
            </Button>

            <Button
              leftIcon={<Icon as={FiLogOut} />}
              size="sm"
              variant="outline"
              borderColor="var(--rule)"
              borderRadius="2px"
              fontSize="12px"
              fontWeight="500"
              color="var(--ink)"
              _hover={{ bg: 'var(--surface-alt)' }}
              onClick={handleSignOut}
            >
              Sign Out
            </Button>
          </HStack>
        </Flex>
      </Box>

      {/* Mandatory Emergency Disclaimer Notice */}
      <Box bg="#FFF8E6" borderBottom="1px solid #FFE082" px={{ base: 4, md: 8 }} py={2.5}>
        <Box maxW="1400px" mx="auto">
          <Text fontSize="12px" color="#664D03" fontWeight="500">
            ⚠️ <strong>DEMO SIMULATION ONLY:</strong> Academic emergency response simulation project. Not connected to
            real ERSS-112 or police/fire/medical services.
          </Text>
        </Box>
      </Box>

      {/* Main Operational Container */}
      <Box maxW="1400px" mx="auto" px={{ base: 4, md: 8 }} py={6}>
        {error && (
          <Box mb={4} p={3} bg="#FDEDED" border="1px solid #F5C2C7" borderRadius="2px">
            <Text fontSize="13px" color="#58151C">
              Database Connection Notice: {error.message}
            </Text>
          </Box>
        )}

        {/* Triage Status Summary Bar */}
        <SimpleGrid columns={{ base: 2, lg: 4 }} spacing={4} mb={6}>
          <StatsCard
            active={!status}
            title="Unresolved Incident Queue"
            stat={unresolved.length.toString()}
            icon={<AiOutlinePhone size="18px" />}
            onClick={() => setStatus(undefined)}
          />
          <StatsCard
            active={status === STATUSES.OPEN.key}
            title="Open / In Triage"
            stat={open.length.toString()}
            icon={<AiOutlineFolderOpen size="18px" />}
            onClick={() => setStatus(STATUSES.OPEN.key)}
          />
          <StatsCard
            active={status === STATUSES.DISPATCHED.key}
            title="Units Dispatched"
            stat={dispatched.length.toString()}
            icon={<AiOutlineClockCircle size="18px" />}
            onClick={() => setStatus(STATUSES.DISPATCHED.key)}
          />
          <StatsCard
            active={status === STATUSES.RESOLVED.key}
            title="Resolved Incidents"
            stat={resolved.length.toString()}
            icon={<BsCheck2Circle size="18px" />}
            onClick={() => setStatus(STATUSES.RESOLVED.key)}
          />
        </SimpleGrid>

        {/* Calls Feed Section */}
        <Box id="calls-section" mb={8}>
          <Flex justify="space-between" align="center" mb={3}>
            <Text fontSize="15px" fontWeight="600" color="var(--ink)">
              Active Call Intake & Automated Triage Stream
            </Text>
            <Text fontSize="12px" color="#5C6675">
              Showing {filteredCalls.length} of {calls.length} total calls
            </Text>
          </Flex>
          <CallsTable selectedRowKey={selectedRow?.key} onRowClick={handleClick} calls={filteredCalls} />
        </Box>

        {/* Geographic Incident Map */}
        <Box mb={8}>
          <Text fontSize="15px" fontWeight="600" color="var(--ink)" mb={3}>
            Geospatial Dispatch Map (India ERSS-112 Coverage)
          </Text>
          <Box
            id="map"
            w="full"
            h="46vh"
            border="1px solid var(--rule)"
            borderRadius="2px"
            bg="var(--surface)"
            overflow="hidden"
          >
            <Wrapper apiKey={import.meta.env.VITE_GOOGLE_API_KEY} render={render}>
              <Map
                style={{
                  height: '100%',
                }}
                center={
                  selectedRow?.geocode ?? {
                    lat: 21.1458,
                    lng: 79.0882,
                  }
                }
                zoom={selectedRow?.geocode ? 16 : 5}
              >
                {filteredCalls.map((call) => {
                  if (call.status === STATUSES.RESOLVED.key) return null;
                  if (!PRIORITIES?.[call.priority]?.color) return null;
                  return (
                    <Marker
                      key={call.key}
                      position={call.geocode}
                      icon={{
                        url: `https://maps.google.com/mapfiles/ms/icons/${PRIORITIES?.[call.priority]?.color}-dot.png`,
                      }}
                    />
                  );
                })}
              </Map>
            </Wrapper>
          </Box>
        </Box>

        {/* Operational Specifications */}
        <FAQ />
      </Box>

      {/* Footer */}
      <Footer />

      {/* Recorded Call Upload Modal (Preserved & Protected inside Dashboard) */}
      <RecordedCallUpload isOpen={isUploadOpen} onClose={onUploadClose} onCallProcessed={handleCallProcessed} />
    </Box>
  );
};
