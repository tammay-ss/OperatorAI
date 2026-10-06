import {
  Badge,
  Box,
  Collapse,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
  Button,
  Icon,
  VStack,
  Select,
  HStack,
  Stack,
  Flex,
  Image,
} from '@chakra-ui/react';
import React, { useState } from 'react';
import { FiChevronDown, FiChevronUp, FiMapPin } from 'react-icons/fi';
import { ref, set } from 'firebase/database';
import { db } from '../firebaseConfig';
import { CallData, EMERGENCIES, PRIORITIES, STATUSES } from '../types/calls';
import { Info } from './Info';
import { StatusIndicator } from './StatusIndicator';
import { AIAnalysisPanel } from './AIAnalysisPanel';

const headers = ['Priority', 'Caller & Source', 'Emergency', 'Time', 'Location', 'Status', ''];

interface TrProps {
  selected: boolean;
  data: CallData;
  onClick: (data: CallData) => void;
  onStatusChange?: (callSid: string, newStatus: string) => void;
}

async function updateField(callSid: string, key: string, value: string) {
  try {
    set(ref(db, `/calls/${callSid}/${key}`), value);
  } catch (err) {
    console.debug('Failed to update RTDB field:', err);
  }

  try {
    await fetch(`/api/incidents/${callSid}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
  } catch (err) {
    console.debug('Failed to update backend incident status:', err);
  }
}

const TableRow: React.FC<TrProps> = ({ data, selected, onClick, onStatusChange }) => {
  const { isOpen, onToggle } = useDisclosure({
    defaultIsOpen: data.live,
  });

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return 'Unknown Number';
    if (
      phone.toLowerCase().includes('recorded') ||
      phone.toLowerCase().includes('demo') ||
      phone.toLowerCase().includes('upload')
    ) {
      return phone;
    }
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
    }
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
    }
    const match = /(\d{3})(\d{3})(\d{4})$/.exec(cleaned);
    if (match) {
      return `(${match[1]}) ${match[2]}-${match[3]}`;
    }
    return phone;
  };

  const formattedPhone = formatPhoneNumber(data.phone);
  const isUploadSource = data.source === 'upload';
  const isDemoSource = data.source === 'demo';
  const emergencyInfo = data.emergency ? EMERGENCIES[data.emergency as keyof typeof EMERGENCIES] : null;

  return (
    <>
      <Tr
        cursor="pointer"
        _hover={{
          bg: 'var(--surface-alt)',
        }}
        bg={selected ? 'var(--surface-alt)' : 'var(--surface)'}
        borderBottom="1px solid var(--rule)"
        onClick={() => onClick(data)}
      >
        <Td textAlign="left" w="30px" pl={4} py={3}>
          <Badge fontSize="11px" fontWeight="600" borderRadius="2px" colorScheme={PRIORITIES?.[data.priority]?.color}>
            {data.priority}
          </Badge>
        </Td>
        <Td py={3}>
          <Flex alignItems="center">
            <Box mr={3}>
              <StatusIndicator active={data.live} />
            </Box>
            <Box mr={3}>
              <HStack spacing={2} align="center">
                <Text fontWeight="600" fontSize="13px" color="var(--ink)">
                  {data.name}
                </Text>
                {data.incident_id && (
                  <Badge colorScheme="blue" variant="subtle" fontSize="10px">
                    {data.incident_id}
                  </Badge>
                )}
              </HStack>
              <Text fontSize="12px" color="#5C6675">
                {formattedPhone}
              </Text>
            </Box>
            <HStack spacing={1}>
              {isUploadSource ? (
                <Badge size="sm" colorScheme="purple" variant="subtle" fontSize="10px" borderRadius="2px">
                  Recorded Demo
                </Badge>
              ) : isDemoSource ? (
                <Badge size="sm" colorScheme="teal" variant="subtle" fontSize="10px" borderRadius="2px">
                  Pipeline Test
                </Badge>
              ) : (
                <Badge size="sm" colorScheme={data.live ? 'green' : 'gray'} fontSize="10px" borderRadius="2px">
                  {data.live ? 'Twilio Live' : 'Twilio Logged'}
                </Badge>
              )}
              {data.audioDuration ? (
                <Badge size="xs" colorScheme="gray" variant="outline" fontSize="10px" borderRadius="2px">
                  {Math.round(data.audioDuration)}s
                </Badge>
              ) : null}
            </HStack>
          </Flex>
        </Td>
        <Td fontSize="13px" color="var(--ink)" py={3}>
          <HStack spacing={1}>
            {emergencyInfo && <Text>{emergencyInfo.icon}</Text>}
            <Text>{data.emergency || '—'}</Text>
            {data.confidence !== undefined && data.confidence > 0 && (
              <Badge fontSize="9px" colorScheme="gray" borderRadius="full" fontWeight="500">
                {Math.round(data.confidence * 100)}%
              </Badge>
            )}
          </HStack>
        </Td>
        <Td fontSize="13px" color="#5C6675" py={3}>
          {new Date(data.dateCreated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </Td>
        <Td fontSize="13px" color="var(--ink)" py={3}>
          <VStack align="flex-start" spacing={0}>
            <Text fontWeight="500">{data.location_text || data.location || '—'}</Text>
            <Badge fontSize="9px" colorScheme="purple" variant="subtle">
              Caller Statement
            </Badge>
          </VStack>
        </Td>
        <Td py={3}>
          <Badge colorScheme={STATUSES?.[data.status]?.color} fontSize="11px" fontWeight="500" borderRadius="2px">
            {data.status}
          </Badge>
        </Td>
        <Td onClick={onToggle} py={3} textAlign="right" pr={4}>
          <Box display="inline-block">{isOpen ? <FiChevronUp size="16px" /> : <FiChevronDown size="16px" />}</Box>
        </Td>
      </Tr>
      <Tr display={isOpen ? 'contents' : 'none'}>
        <Td colSpan={headers.length} bg="var(--surface-alt)" p={4} borderBottom="1px solid var(--rule)">
          <Collapse in={isOpen} animateOpacity>
            <Stack direction={{ base: 'column', lg: 'row' }} spacing={6} p={2}>
              {/* Left Column: Transcript + Map Preview */}
              <VStack w={{ base: 'full', lg: '2xl' }} alignItems="flex-start" spacing={3}>
                <Flex justify="space-between" align="center" w="full">
                  <Text fontSize="13px" fontWeight="600" color="var(--ink)">
                    Transcript Stream
                  </Text>
                  <Badge colorScheme={isUploadSource ? 'purple' : isDemoSource ? 'teal' : 'blue'} fontSize="11px" borderRadius="2px">
                    Source: {isUploadSource ? 'Recorded Audio Upload' : isDemoSource ? 'Demo Pipeline Test' : 'Twilio Live Stream'}
                  </Badge>
                </Flex>
                <Text
                  whiteSpace="pre-wrap"
                  border="1px solid var(--rule)"
                  fontFamily="monospace"
                  fontSize="12px"
                  lineHeight="1.5"
                  borderRadius="2px"
                  w="full"
                  p={3}
                  bg="var(--surface)"
                  color="var(--ink)"
                >
                {data.transcript || 'No transcript generated.'}{' '}
                {data.live ? <span className="blinking-cursor">|</span> : null}
              </Text>
              {data.recordingUrl && (
                <Box p={2.5} bg="var(--surface)" border="1px solid var(--rule)" borderRadius="2px" w="full">
                  <Flex justify="space-between" align="center" mb={1.5}>
                    <Text fontSize="11px" fontWeight="600" color="var(--ink)">
                      🎙️ Twilio Call Recording
                    </Text>
                    {data.recordingDuration && (
                      <Badge size="xs" colorScheme="purple">
                        {data.recordingDuration}s
                      </Badge>
                    )}
                  </Flex>
                  <audio controls src={data.recordingUrl} style={{ width: '100%', height: '32px' }} />
                </Box>
              )}
              {(data.geocode || (data.latitude && data.longitude)) && (
                <Box
                  p={3}
                  bg="var(--surface)"
                  border="1px solid var(--rule)"
                  borderRadius="2px"
                  w="full"
                >
                  <Flex justify="space-between" align="center" mb={1}>
                    <HStack spacing={1.5}>
                      <Icon as={FiMapPin} color="#DC2626" />
                      <Text fontSize="12px" fontWeight="700" color="var(--ink)">
                        {data.location_text || data.location || 'Incident Coordinates'}
                      </Text>
                    </HStack>
                    <Badge colorScheme="purple" fontSize="10px">
                      Source: Caller Statement
                    </Badge>
                  </Flex>
                  <Text fontSize="11px" color="#5C6675" mb={2}>
                    {data.formattedAddress || 'India Regional Dispatch Area'}
                  </Text>
                  <Flex justify="space-between" align="center">
                    <Text fontSize="10px" fontFamily="monospace" color="#717D8A">
                      {(data.latitude ?? data.geocode?.lat)?.toFixed(5)}, {(data.longitude ?? data.geocode?.lng)?.toFixed(5)}
                    </Text>
                    <Button
                      size="xs"
                      colorScheme="blue"
                      variant="outline"
                      fontSize="10px"
                      leftIcon={<FiMapPin />}
                      onClick={() => {
                        onClick(data);
                        document.querySelector('#leaflet-dispatch-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    >
                      Focus on Map
                    </Button>
                  </Flex>
                </Box>
              )}

                {/* AI Analysis Panel */}
                <Box w="full" mt={2}>
                  <AIAnalysisPanel data={data} />
                </Box>
              </VStack>

              {/* Right Column: Dispatcher Controls */}
              <VStack flexGrow={1} alignSelf="flex-start" spacing={3} w={{ base: 'full', lg: 'auto' }}>
                <Text fontSize="13px" fontWeight="600" color="var(--ink)" alignSelf="flex-start">
                  Dispatcher Controls
                </Text>
                <HStack w="full" maxW="sm" justify="space-between">
                  <Text fontSize="13px" fontWeight="500" color="#5C6675" w={28}>
                    Status
                  </Text>
                  <Select
                    size="sm"
                    value={data.status}
                    borderRadius="2px"
                    borderColor="var(--rule)"
                    fontSize="13px"
                    bg="var(--surface)"
                    onChange={(e) => {
                      updateField(data.callSid, 'status', e.target.value);
                      onStatusChange?.(data.callSid, e.target.value);
                    }}
                  >
                    {Object.entries(STATUSES).map(([, { key: statusKey, display }]) => {
                      return (
                        <option key={statusKey} value={statusKey}>
                          {display}
                        </option>
                      );
                    })}
                  </Select>
                </HStack>
                <HStack w="full" maxW="sm" justify="space-between">
                  <Text fontSize="13px" fontWeight="500" color="#5C6675" w={28}>
                    Priority
                  </Text>
                  <Select
                    size="sm"
                    value={data.priority}
                    borderRadius="2px"
                    borderColor="var(--rule)"
                    fontSize="13px"
                    bg="var(--surface)"
                    onChange={(e) => updateField(data.callSid, 'priority', e.target.value)}
                  >
                    {Object.entries(PRIORITIES).map(([, { key: statusKey, display }]) => {
                      return (
                        <option key={statusKey} value={statusKey}>
                          {display}
                        </option>
                      );
                    })}
                  </Select>
                </HStack>
                <HStack w="full" maxW="sm" justify="space-between">
                  <Text fontSize="13px" fontWeight="500" color="#5C6675" w={28}>
                    Category
                  </Text>
                  <Select
                    size="sm"
                    value={data.emergency}
                    borderRadius="2px"
                    borderColor="var(--rule)"
                    fontSize="13px"
                    bg="var(--surface)"
                    onChange={(e) => updateField(data.callSid, 'emergency', e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {Object.entries(EMERGENCIES).map(([, { key: statusKey, display }]) => {
                      return (
                        <option key={statusKey} value={statusKey}>
                          {display}
                        </option>
                      );
                    })}
                  </Select>
                </HStack>
                <HStack w="full" maxW="sm" justify="space-between">
                  <Text fontSize="13px" fontWeight="500" color="#5C6675" w={28}>
                    Intake Method
                  </Text>
                  <Text fontSize="13px" color="var(--ink)" fontWeight="500">
                    {isUploadSource ? 'Recorded Audio Fallback' : isDemoSource ? 'Demo Pipeline Test' : 'Twilio Live Voice Stream'}
                  </Text>
                </HStack>
                {data.formattedAddress && (
                  <HStack w="full" maxW="sm" justify="space-between">
                    <Text fontSize="13px" fontWeight="500" color="#5C6675" w={28}>
                      Full Address
                    </Text>
                    <Text fontSize="12px" color="var(--ink)" fontWeight="500" textAlign="right" maxW="200px">
                      {data.formattedAddress}
                    </Text>
                  </HStack>
                )}
                {data.dateProcessed && (
                  <HStack w="full" maxW="sm" justify="space-between">
                    <Text fontSize="13px" fontWeight="500" color="#5C6675" w={28}>
                      AI Processed
                    </Text>
                    <Text fontSize="12px" color="var(--ink)" fontWeight="500">
                      {new Date(data.dateProcessed).toLocaleTimeString()}
                    </Text>
                  </HStack>
                )}
                <HStack w="full" maxW="sm" justify="space-between" pt={1}>
                  <Text fontSize="13px" fontWeight="500" color="#5C6675" w={28}>
                    Location Source
                  </Text>
                  <Badge colorScheme="purple" fontSize="11px" borderRadius="2px">
                    Caller Statement ({data.location_precision || 'Geocoded'})
                  </Badge>
                </HStack>
                {(data.latitude || data.geocode?.lat) && (
                  <HStack w="full" maxW="sm" justify="space-between">
                    <Text fontSize="13px" fontWeight="500" color="#5C6675" w={28}>
                      Coordinates
                    </Text>
                    <Text fontSize="11px" fontFamily="monospace" color="var(--ink)">
                      {(data.latitude ?? data.geocode?.lat)?.toFixed(5)}, {(data.longitude ?? data.geocode?.lng)?.toFixed(5)}
                    </Text>
                  </HStack>
                )}
              </VStack>
            </Stack>
          </Collapse>
        </Td>
      </Tr>
    </>
  );
};

const CallsTable: React.FC<{
  selectedRowKey?: string | null;
  calls: CallData[];
  onRowClick: (data: CallData) => void;
  onStatusChange?: (callSid: string, newStatus: string) => void;
}> = ({ calls, onRowClick, selectedRowKey, onStatusChange }) => {
  const sortDescendingByDate = calls.sort(
    (a, b) => new Date((b as CallData).dateCreated).getTime() - new Date((a as CallData).dateCreated).getTime()
  );

  const sortByLive = sortDescendingByDate.sort((a, b) => {
    return Number((b as CallData).live) - Number((a as CallData).live);
  });

  return (
    <TableContainer
      display="flex"
      maxH="80vh"
      overflowY="auto"
      border="1px solid var(--rule)"
      borderRadius="2px"
      bg="var(--surface)"
    >
      <Table size="sm">
        <Thead position="sticky" top="0" bg="var(--surface-alt)" zIndex={1} borderBottom="1px solid var(--rule)">
          <Tr>
            {headers.map((header) => (
              <Th
                key={header}
                color="#5C6675"
                fontSize="11px"
                fontWeight="600"
                letterSpacing="0.04em"
                py={3}
                borderBottom="1px solid var(--rule)"
              >
                {header}
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {!sortByLive.length ? (
            <Tr>
              <Td bg="var(--surface)" colSpan={headers.length} py={8}>
                <Info text="No active calls found in queue." />
              </Td>
            </Tr>
          ) : (
            sortByLive.map((v) => (
              <TableRow
                key={v.key}
                selected={selectedRowKey === v.key}
                data={v}
                onClick={onRowClick}
                onStatusChange={onStatusChange}
              />
            ))
          )}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default CallsTable;
