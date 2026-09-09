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
  VStack,
  Select,
  HStack,
  Stack,
  Flex,
  Image,
} from '@chakra-ui/react';
import React from 'react';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { ref, set } from 'firebase/database';
import { db } from '../firebaseConfig';
import { CallData, EMERGENCIES, PRIORITIES, STATUSES } from '../types/calls';
import { Info } from './Info';
import { StatusIndicator } from './StatusIndicator';

const headers = ['Priority', 'Caller & Source', 'Emergency', 'Time', 'Location', 'Status', ''];

interface TrProps {
  selected: boolean;
  data: CallData;
  onClick: (data: CallData) => void;
}

function updateField(callSid: string, key: string, value: string) {
  set(ref(db, `/calls/${callSid}/${key}`), value);
}

const TableRow: React.FC<TrProps> = ({ data, selected, onClick }) => {
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
              <Text fontWeight="600" fontSize="13px" color="var(--ink)">
                {data.name}
              </Text>
              <Text fontSize="12px" color="#5C6675">
                {formattedPhone}
              </Text>
            </Box>
            <HStack spacing={1}>
              {isUploadSource ? (
                <Badge size="sm" colorScheme="purple" variant="subtle" fontSize="10px" borderRadius="2px">
                  Recorded Demo
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
          {data.emergency || '—'}
        </Td>
        <Td fontSize="13px" color="#5C6675" py={3}>
          {new Date(data.dateCreated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </Td>
        <Td fontSize="13px" color="var(--ink)" py={3}>
          {data.location || '—'}
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
              <VStack w={{ base: 'full', lg: '2xl' }} alignItems="flex-start" spacing={3}>
                <Flex justify="space-between" align="center" w="full">
                  <Text fontSize="13px" fontWeight="600" color="var(--ink)">
                    Transcript Stream
                  </Text>
                  <Badge colorScheme={isUploadSource ? 'purple' : 'blue'} fontSize="11px" borderRadius="2px">
                    Source: {isUploadSource ? 'Recorded Audio Upload' : 'Twilio Live Stream'}
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
                {data.geocode && (
                  <Image
                    cursor="pointer"
                    border="1px solid var(--rule)"
                    borderRadius="2px"
                    onClick={() => {
                      onClick(data);
                      document.querySelector('#map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    w="full"
                    maxW="3xl"
                    src={`https://maps.googleapis.com/maps/api/staticmap?center=${data.geocode?.lat},${
                      data.geocode?.lng
                    }&zoom=16&size=500x150&maptype=roadmap
&markers=color:${PRIORITIES[data.priority]?.color}%7C${data.geocode?.lat},${data.geocode?.lng}
&key=${(import.meta.env.VITE_GOOGLE_API_KEY || '').replace(/\n+/, '').trim()}`}
                  />
                )}
              </VStack>

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
                    onChange={(e) => updateField(data.callSid, 'status', e.target.value)}
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
                    {isUploadSource ? 'Recorded Audio Fallback' : 'Twilio Live Voice Stream'}
                  </Text>
                </HStack>
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
}> = ({ calls, onRowClick, selectedRowKey }) => {
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
              <TableRow key={v.key} selected={selectedRowKey === v.key} data={v} onClick={onRowClick} />
            ))
          )}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default CallsTable;
