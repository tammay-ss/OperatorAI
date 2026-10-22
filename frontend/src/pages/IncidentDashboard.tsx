import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Heading,
  Badge,
  Button,
  Icon,
  Input,
  Select,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  SimpleGrid,
  Tag,
  Collapse,
  useToast,
  Spinner,
} from '@chakra-ui/react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  FiShield,
  FiSearch,
  FiMapPin,
  FiClock,
  FiAlertTriangle,
  FiUser,
  FiLogOut,
  FiChevronLeft,
  FiChevronRight,
  FiChevronDown,
  FiChevronUp,
  FiActivity,
  FiDatabase,
  FiGlobe,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthProvider';
import { CallData, EMERGENCIES, PRIORITIES, STATUSES } from '../types/calls';

export const IncidentDashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [incidents, setIncidents] = useState<CallData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Search, Filter, Sort, Pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [languageFilter, setLanguageFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'time-desc' | 'time-asc' | 'priority-desc' | 'type-asc' | 'location-asc'>('time-desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch incidents from API
  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch('/api/incidents');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.incidents || [];
        setIncidents(list);
      }
    } catch (err) {
      console.warn('Error fetching incidents from API:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();

    // Subscribe to SSE for live sync
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/incidents/stream');
      eventSource.addEventListener('incident_created', (e) => {
        try {
          const newIncident: CallData = JSON.parse(e.data);
          setIncidents((prev) => [newIncident, ...prev.filter((i) => i.callSid !== newIncident.callSid)]);
        } catch (err) {}
      });

      eventSource.addEventListener('incident_updated', (e) => {
        try {
          const updated = JSON.parse(e.data);
          setIncidents((prev) =>
            prev.map((i) => (i.callSid === updated.callSid || i.incident_id === updated.callSid ? { ...i, ...updated } : i))
          );
        } catch (err) {}
      });
    } catch (err) {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [fetchIncidents]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleStatusUpdate = async (callSid: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/incidents/${callSid}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setIncidents((prev) =>
          prev.map((i) =>
            i.callSid === callSid || i.incident_id === callSid
              ? { ...i, status: newStatus as any, ...(newStatus === 'RESOLVED' ? { dateResolved: new Date().toISOString() } : {}) }
              : i
          )
        );
        toast({
          title: `Status Updated`,
          description: `Incident ${callSid} changed to ${newStatus}`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Top Aggregates Summary for analysis
  const summary = useMemo(() => {
    const total = incidents.length;
    const highPriority = incidents.filter((i) => i.priority === 'HIGH' && i.status !== 'RESOLVED').length;
    const openCount = incidents.filter((i) => i.status === 'OPEN').length;
    const dispatchedCount = incidents.filter((i) => i.status === 'DISPATCHED').length;
    const resolvedCount = incidents.filter((i) => i.status === 'RESOLVED').length;

    // Counts by emergency category
    const categoryCounts: Record<string, number> = {};
    incidents.forEach((i) => {
      const cat = i.emergency || 'Other Emergency';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    // Top locations / hotspots
    const locationCounts: Record<string, number> = {};
    incidents.forEach((i) => {
      const loc = i.location_text || i.location || i.formattedAddress || 'Unknown Location';
      locationCounts[loc] = (locationCounts[loc] || 0) + 1;
    });

    const topLocations = Object.entries(locationCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4);

    return {
      total,
      highPriority,
      openCount,
      dispatchedCount,
      resolvedCount,
      categoryCounts,
      topLocations,
    };
  }, [incidents]);

  // Distinct languages for filter dropdown
  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    incidents.forEach((i) => {
      if (i.language) langs.add(i.language);
    });
    return Array.from(langs);
  }, [incidents]);

  // Filtered & Sorted incidents
  const filteredIncidents = useMemo(() => {
    return incidents
      .filter((item) => {
        // Free-text Search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchId = (item.incident_id || item.callSid || '').toLowerCase().includes(q);
          const matchLoc = (item.location_text || item.location || item.formattedAddress || '').toLowerCase().includes(q);
          const matchType = (item.emergency || '').toLowerCase().includes(q);
          const matchTranscript = (item.transcript || '').toLowerCase().includes(q);
          const matchTranslation = (item.english_translation || '').toLowerCase().includes(q);
          const matchCaller = (item.name || '').toLowerCase().includes(q);
          const matchPhone = (item.phone || '').toLowerCase().includes(q);
          if (!matchId && !matchLoc && !matchType && !matchTranscript && !matchTranslation && !matchCaller && !matchPhone) {
            return false;
          }
        }

        // Type Filter
        if (typeFilter !== 'ALL' && item.emergency !== typeFilter) {
          return false;
        }

        // Severity / Priority Filter
        if (severityFilter !== 'ALL' && item.priority !== severityFilter) {
          return false;
        }

        // Status Filter
        if (statusFilter !== 'ALL' && item.status !== statusFilter) {
          return false;
        }

        // Language Filter
        if (languageFilter !== 'ALL' && item.language !== languageFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'time-desc') {
          return new Date(b.dateCreated || b.timestamp || 0).getTime() - new Date(a.dateCreated || a.timestamp || 0).getTime();
        }
        if (sortBy === 'time-asc') {
          return new Date(a.dateCreated || a.timestamp || 0).getTime() - new Date(b.dateCreated || b.timestamp || 0).getTime();
        }
        if (sortBy === 'priority-desc') {
          const priorityWeight: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, TBD: 0 };
          return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        }
        if (sortBy === 'type-asc') {
          return (a.emergency || '').localeCompare(b.emergency || '');
        }
        if (sortBy === 'location-asc') {
          const locA = a.location_text || a.location || '';
          const locB = b.location_text || b.location || '';
          return locA.localeCompare(locB);
        }
        return 0;
      });
  }, [incidents, searchQuery, typeFilter, severityFilter, statusFilter, languageFilter, sortBy]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredIncidents.length / pageSize));
  const paginatedIncidents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredIncidents.slice(start, start + pageSize);
  }, [filteredIncidents, currentPage, pageSize]);

  // Adjust page if out of bounds after filtering
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const toggleRow = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <Box minH="100vh" bg="var(--surface)" color="var(--ink)">
      {/* Top Header Bar */}
      <Box borderBottom="1px solid var(--rule)" px={{ base: 4, md: 8 }} py={3} bg="var(--surface)">
        <Flex maxW="1400px" mx="auto" justify="space-between" align="center" wrap="wrap" gap={3}>
          <HStack spacing={3}>
            <Icon as={FiShield} w={5} h={5} color="var(--accent)" />
            <Text fontWeight="700" fontSize="16px" color="var(--ink)" letterSpacing="-0.02em">
              OPERATORAI
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
              Incident History & Analytics
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

            {/* Navigation back to Live Dispatch Map */}
            <Button
              as={RouterLink}
              to="/dashboard"
              size="sm"
              bg="var(--accent)"
              color="white"
              _hover={{ bg: 'var(--accent-hover)' }}
              borderRadius="2px"
              fontSize="12px"
              fontWeight="600"
              leftIcon={<FiMapPin />}
            >
              🗺️ Live Dispatch Map
            </Button>

            {/* Refresh Data */}
            <Button
              size="sm"
              variant="outline"
              borderColor="var(--rule)"
              borderRadius="2px"
              fontSize="12px"
              fontWeight="500"
              color="var(--ink)"
              _hover={{ bg: 'var(--surface-alt)' }}
              leftIcon={<FiActivity />}
              onClick={fetchIncidents}
              isLoading={loading}
            >
              Refresh
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

      {/* Main Container */}
      <Box maxW="1400px" mx="auto" px={{ base: 4, md: 8 }} py={6}>
        {/* Page Title & Context */}
        <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} direction={{ base: 'column', md: 'row' }} gap={2} mb={6}>
          <Box>
            <Heading as="h1" fontSize="22px" fontWeight="700" color="var(--ink)" letterSpacing="-0.01em">
              Incident Registry & Emergency Response Analytics
            </Heading>
            <Text fontSize="13px" color="#5C6675" mt={1}>
              Comprehensive historical audit log of all voice-triaged calls, multilingual transcripts, geocoded locations, and dispatch actions.
            </Text>
          </Box>
          <HStack spacing={2}>
            <Tag size="md" colorScheme="blue" variant="subtle">
              Total Recorded: {summary.total}
            </Tag>
            <Tag size="md" colorScheme="red" variant="subtle">
              Active High Urgency: {summary.highPriority}
            </Tag>
          </HStack>
        </Flex>

        {/* Analytical Metric Cards at the Top */}
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 5 }} spacing={4} mb={6}>
          <Box p={4} bg="var(--surface-alt)" border="1px solid var(--rule)" borderRadius="2px">
            <Text fontSize="11px" fontWeight="600" color="#5C6675" textTransform="uppercase" letterSpacing="0.05em">
              Total Incidents
            </Text>
            <Text fontSize="24px" fontWeight="700" color="var(--ink)" mt={1}>
              {summary.total}
            </Text>
            <Text fontSize="11px" color="#5C6675" mt={1}>
              {summary.openCount} Open • {summary.dispatchedCount} Dispatched
            </Text>
          </Box>

          <Box p={4} bg="var(--surface-alt)" border="1px solid var(--rule)" borderRadius="2px">
            <Text fontSize="11px" fontWeight="600" color="#5C6675" textTransform="uppercase" letterSpacing="0.05em">
              Resolved Cases
            </Text>
            <Text fontSize="24px" fontWeight="700" color="green.600" mt={1}>
              {summary.resolvedCount}
            </Text>
            <Text fontSize="11px" color="#5C6675" mt={1}>
              {summary.total > 0 ? Math.round((summary.resolvedCount / summary.total) * 100) : 0}% Resolution Rate
            </Text>
          </Box>

          <Box p={4} bg="var(--surface-alt)" border="1px solid var(--rule)" borderRadius="2px">
            <Text fontSize="11px" fontWeight="600" color="#5C6675" textTransform="uppercase" letterSpacing="0.05em">
              High Priority Alerts
            </Text>
            <Text fontSize="24px" fontWeight="700" color="red.600" mt={1}>
              {summary.highPriority}
            </Text>
            <Text fontSize="11px" color="#5C6675" mt={1}>
              Requires urgent intervention
            </Text>
          </Box>

          <Box p={4} bg="var(--surface-alt)" border="1px solid var(--rule)" borderRadius="2px" gridColumn={{ lg: 'span 2' }}>
            <Text fontSize="11px" fontWeight="600" color="#5C6675" textTransform="uppercase" letterSpacing="0.05em" mb={2}>
              Top Incident Hotspots (Dispatch Analysis)
            </Text>
            {summary.topLocations.length > 0 ? (
              <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={2}>
                {summary.topLocations.map(([loc, count], idx) => (
                  <Flex key={idx} justify="space-between" align="center" bg="var(--surface)" p={1.5} border="1px solid var(--rule)" borderRadius="2px">
                    <HStack spacing={1.5} maxW="180px">
                      <Icon as={FiMapPin} color="red.500" w={3} h={3} />
                      <Text fontSize="11px" fontWeight="600" noOfLines={1} title={loc}>
                        {loc}
                      </Text>
                    </HStack>
                    <Badge size="sm" colorScheme="blue">
                      {count} {count === 1 ? 'call' : 'calls'}
                    </Badge>
                  </Flex>
                ))}
              </SimpleGrid>
            ) : (
              <Text fontSize="12px" color="#5C6675">No location clusters recorded yet.</Text>
            )}
          </Box>
        </SimpleGrid>

        {/* Search & Filter Toolbar */}
        <Box bg="var(--surface-alt)" p={4} border="1px solid var(--rule)" borderRadius="2px" mb={6}>
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 6 }} spacing={3}>
            {/* Search Input */}
            <Box gridColumn={{ base: 'span 1', sm: 'span 2' }}>
              <Text fontSize="11px" fontWeight="600" color="#5C6675" mb={1}>
                Search (ID, Summary, Location, Caller)
              </Text>
              <HStack spacing={2} bg="var(--surface)" border="1px solid var(--rule)" borderRadius="2px" px={3} py={1}>
                <Icon as={FiSearch} color="#717D8A" />
                <Input
                  variant="unstyled"
                  placeholder="Filter incidents..."
                  fontSize="12px"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </HStack>
            </Box>

            {/* Type Filter */}
            <Box>
              <Text fontSize="11px" fontWeight="600" color="#5C6675" mb={1}>
                Incident Type
              </Text>
              <Select
                size="sm"
                bg="var(--surface)"
                borderRadius="2px"
                fontSize="12px"
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="ALL">All Emergency Types</option>
                {Object.keys(EMERGENCIES).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </Select>
            </Box>

            {/* Priority Filter */}
            <Box>
              <Text fontSize="11px" fontWeight="600" color="#5C6675" mb={1}>
                Priority / Severity
              </Text>
              <Select
                size="sm"
                bg="var(--surface)"
                borderRadius="2px"
                fontSize="12px"
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="ALL">All Priorities</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
                <option value="TBD">TBD</option>
              </Select>
            </Box>

            {/* Status Filter */}
            <Box>
              <Text fontSize="11px" fontWeight="600" color="#5C6675" mb={1}>
                Dispatch Status
              </Text>
              <Select
                size="sm"
                bg="var(--surface)"
                borderRadius="2px"
                fontSize="12px"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="DISPATCHED">Dispatched</option>
                <option value="RESOLVED">Resolved</option>
              </Select>
            </Box>

            {/* Language Filter */}
            <Box>
              <Text fontSize="11px" fontWeight="600" color="#5C6675" mb={1}>
                Language
              </Text>
              <Select
                size="sm"
                bg="var(--surface)"
                borderRadius="2px"
                fontSize="12px"
                value={languageFilter}
                onChange={(e) => {
                  setLanguageFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="ALL">All Languages</option>
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </Select>
            </Box>
          </SimpleGrid>

          {/* Sort bar & Results counter */}
          <Flex justify="space-between" align="center" mt={3} pt={3} borderTop="1px solid var(--rule)" wrap="wrap" gap={2}>
            <Text fontSize="12px" color="#5C6675">
              Showing <strong>{paginatedIncidents.length}</strong> of <strong>{filteredIncidents.length}</strong> matching records
              {filteredIncidents.length !== incidents.length && ` (filtered from ${incidents.length} total)`}
            </Text>

            <HStack spacing={3}>
              <Text fontSize="12px" color="#5C6675">
                Sort by:
              </Text>
              <Select
                size="xs"
                w="160px"
                bg="var(--surface)"
                borderRadius="2px"
                fontSize="11px"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="time-desc">Time: Newest First</option>
                <option value="time-asc">Time: Oldest First</option>
                <option value="priority-desc">Priority: High to Low</option>
                <option value="type-asc">Emergency Type: A-Z</option>
                <option value="location-asc">Location: A-Z</option>
              </Select>
            </HStack>
          </Flex>
        </Box>

        {/* Summarized Table */}
        <Box border="1px solid var(--rule)" borderRadius="2px" bg="var(--surface)" overflow="hidden" mb={6}>
          {loading ? (
            <Flex justify="center" align="center" p={12}>
              <Spinner size="lg" color="var(--accent)" mr={3} />
              <Text fontSize="14px" color="#5C6675">Loading emergency incident registry...</Text>
            </Flex>
          ) : paginatedIncidents.length === 0 ? (
            <Box p={12} textAlign="center">
              <Icon as={FiAlertTriangle} w={8} h={8} color="orange.400" mb={3} />
              <Text fontSize="15px" fontWeight="600" color="var(--ink)">
                No incidents match your filter criteria
              </Text>
              <Text fontSize="13px" color="#5C6675" mt={1}>
                Try adjusting your search query, status, priority, or language filter.
              </Text>
            </Box>
          ) : (
            <TableContainer>
              <Table variant="simple" size="sm">
                <Thead bg="var(--surface-alt)">
                  <Tr>
                    <Th fontSize="11px" color="#5C6675" py={3}>Priority</Th>
                    <Th fontSize="11px" color="#5C6675" py={3}>Incident & Summary</Th>
                    <Th fontSize="11px" color="#5C6675" py={3}>Location</Th>
                    <Th fontSize="11px" color="#5C6675" py={3}>Time & Date</Th>
                    <Th fontSize="11px" color="#5C6675" py={3}>Language</Th>
                    <Th fontSize="11px" color="#5C6675" py={3}>Status</Th>
                    <Th fontSize="11px" color="#5C6675" py={3} textAlign="right">Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {paginatedIncidents.map((incident) => {
                    const id = incident.incident_id || incident.callSid;
                    const isExpanded = expandedId === id;
                    const priorityCfg = PRIORITIES[incident.priority] || PRIORITIES.TBD;
                    const emergencyCfg = incident.emergency ? EMERGENCIES[incident.emergency as keyof typeof EMERGENCIES] : null;

                    return (
                      <React.Fragment key={id}>
                        <Tr
                          _hover={{ bg: 'var(--surface-alt)' }}
                          cursor="pointer"
                          onClick={() => toggleRow(id)}
                          bg={isExpanded ? 'var(--surface-alt)' : 'inherit'}
                        >
                          {/* Priority Column */}
                          <Td py={3}>
                            <Badge
                              colorScheme={priorityCfg.color}
                              fontSize="11px"
                              fontWeight="700"
                              px={2}
                              py={0.5}
                              borderRadius="2px"
                            >
                              {incident.priority || 'TBD'}
                            </Badge>
                          </Td>

                          {/* Incident Type & Summary */}
                          <Td py={3} maxW="320px">
                            <VStack align="flex-start" spacing={0.5}>
                              <HStack spacing={1.5}>
                                <Text fontSize="14px">{emergencyCfg?.icon || '⚠️'}</Text>
                                <Text fontSize="13px" fontWeight="600" color="var(--ink)">
                                  {incident.emergency || 'Emergency Incident'}
                                </Text>
                                <Text fontSize="11px" color="#5C6675" fontFamily="monospace">
                                  ({id})
                                </Text>
                              </HStack>
                              <Text fontSize="11px" color="#5C6675" noOfLines={1} maxW="300px">
                                {incident.english_translation || incident.transcript || 'No transcript generated.'}
                              </Text>
                            </VStack>
                          </Td>

                          {/* Location Column */}
                          <Td py={3} maxW="240px">
                            <VStack align="flex-start" spacing={0.5}>
                              <HStack spacing={1}>
                                <Icon as={FiMapPin} color="red.500" w={3} h={3} />
                                <Text fontSize="12px" fontWeight="600" color="var(--ink)" noOfLines={1} maxW="220px">
                                  {incident.location_text || incident.location || 'Location Pending'}
                                </Text>
                              </HStack>
                              {incident.formattedAddress && (
                                <Text fontSize="10px" color="#5C6675" noOfLines={1} maxW="220px">
                                  {incident.formattedAddress}
                                </Text>
                              )}
                            </VStack>
                          </Td>

                          {/* Timestamp */}
                          <Td py={3}>
                            <HStack spacing={1}>
                              <Icon as={FiClock} color="#717D8A" w={3} h={3} />
                              <Text fontSize="11px" color="#4B5565">
                                {new Date(incident.dateCreated || incident.timestamp || Date.now()).toLocaleString()}
                              </Text>
                            </HStack>
                          </Td>

                          {/* Language */}
                          <Td py={3}>
                            <Badge colorScheme="teal" fontSize="10px" borderRadius="2px">
                              🌐 {incident.language || 'English'}
                            </Badge>
                          </Td>

                          {/* Status */}
                          <Td py={3}>
                            <Badge
                              colorScheme={
                                incident.status === 'RESOLVED' ? 'green' : incident.status === 'DISPATCHED' ? 'orange' : 'blue'
                              }
                              fontSize="11px"
                              borderRadius="2px"
                            >
                              {incident.status || 'OPEN'}
                            </Badge>
                          </Td>

                          {/* Toggle Expand */}
                          <Td py={3} textAlign="right">
                            <Button size="xs" variant="ghost" rightIcon={isExpanded ? <FiChevronUp /> : <FiChevronDown />}>
                              {isExpanded ? 'Hide' : 'Details'}
                            </Button>
                          </Td>
                        </Tr>

                        {/* Expanded Incident Details Drawer */}
                        {isExpanded && (
                          <Tr>
                            <Td colSpan={7} p={0} bg="var(--surface-alt)" borderBottom="1px solid var(--rule)">
                              <Collapse in={isExpanded} animateOpacity>
                                <Box p={5}>
                                  <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
                                    {/* Column 1: Transcripts & Translation */}
                                    <VStack align="flex-start" spacing={3}>
                                      <Text fontSize="12px" fontWeight="700" color="var(--ink)">
                                        Original Spoken Transcript
                                      </Text>
                                      <Box
                                        p={3}
                                        bg="var(--surface)"
                                        border="1px solid var(--rule)"
                                        borderRadius="2px"
                                        w="full"
                                        fontSize="12px"
                                        fontFamily="monospace"
                                        lineHeight="1.5"
                                      >
                                        {incident.original_transcript || incident.transcript || 'No transcript generated.'}
                                      </Box>

                                      {incident.english_translation &&
                                        incident.english_translation !== (incident.original_transcript || incident.transcript) && (
                                          <>
                                            <Text fontSize="12px" fontWeight="700" color="#0369A1">
                                              English Translation (Used for AI Extraction)
                                            </Text>
                                            <Box
                                              p={3}
                                              bg="#F0F9FF"
                                              border="1px solid #BAE6FD"
                                              borderRadius="2px"
                                              w="full"
                                              fontSize="12px"
                                              fontFamily="monospace"
                                              color="#0C4A6E"
                                              lineHeight="1.5"
                                            >
                                              {incident.english_translation}
                                            </Box>
                                          </>
                                        )}
                                    </VStack>

                                    {/* Column 2: Caller, Geocoding & Entities */}
                                    <VStack align="flex-start" spacing={3}>
                                      <Text fontSize="12px" fontWeight="700" color="var(--ink)">
                                        Caller & Geocoded Intelligence
                                      </Text>
                                      <Box p={3} bg="var(--surface)" border="1px solid var(--rule)" borderRadius="2px" w="full">
                                        <VStack align="stretch" spacing={2} fontSize="12px">
                                          <Flex justify="space-between">
                                            <Text color="#5C6675">Caller Name:</Text>
                                            <Text fontWeight="600">{incident.name || 'Unknown'}</Text>
                                          </Flex>
                                          <Flex justify="space-between">
                                            <Text color="#5C6675">Caller Phone:</Text>
                                            <Text fontWeight="600">{incident.phone || 'Unknown'}</Text>
                                          </Flex>
                                          <Flex justify="space-between">
                                            <Text color="#5C6675">Location Precision:</Text>
                                            <Badge size="xs" colorScheme="purple">
                                              {incident.location_precision || 'exact'}
                                            </Badge>
                                          </Flex>
                                          {(incident.latitude || incident.geocode?.lat) && (
                                            <Flex justify="space-between">
                                              <Text color="#5C6675">GPS Coordinates:</Text>
                                              <Text fontFamily="monospace">
                                                {(incident.latitude || incident.geocode?.lat)?.toFixed(5)},{' '}
                                                {(incident.longitude || incident.geocode?.lng)?.toFixed(5)}
                                              </Text>
                                            </Flex>
                                          )}
                                          {incident.entities?.victims !== undefined && (
                                            <Flex justify="space-between">
                                              <Text color="#5C6675">People Affected:</Text>
                                              <Text fontWeight="700" color="red.600">
                                                {incident.entities.victims}
                                              </Text>
                                            </Flex>
                                          )}
                                        </VStack>
                                      </Box>
                                    </VStack>

                                    {/* Column 3: Dispatch Workflow Status Control */}
                                    <VStack align="flex-start" spacing={3}>
                                      <Text fontSize="12px" fontWeight="700" color="var(--ink)">
                                        Update Dispatch Action
                                      </Text>
                                      <Box p={3} bg="var(--surface)" border="1px solid var(--rule)" borderRadius="2px" w="full">
                                        <Text fontSize="11px" color="#5C6675" mb={2}>
                                          Change operational state in real-time:
                                        </Text>
                                        <HStack spacing={2} wrap="wrap">
                                          <Button
                                            size="xs"
                                            colorScheme="blue"
                                            variant={incident.status === 'OPEN' ? 'solid' : 'outline'}
                                            onClick={() => handleStatusUpdate(incident.callSid, 'OPEN')}
                                          >
                                            Open
                                          </Button>
                                          <Button
                                            size="xs"
                                            colorScheme="orange"
                                            variant={incident.status === 'DISPATCHED' ? 'solid' : 'outline'}
                                            onClick={() => handleStatusUpdate(incident.callSid, 'DISPATCHED')}
                                          >
                                            Dispatched
                                          </Button>
                                          <Button
                                            size="xs"
                                            colorScheme="green"
                                            variant={incident.status === 'RESOLVED' ? 'solid' : 'outline'}
                                            onClick={() => handleStatusUpdate(incident.callSid, 'RESOLVED')}
                                          >
                                            Resolved
                                          </Button>
                                        </HStack>
                                        {incident.dateResolved && (
                                          <Text fontSize="10px" color="green.600" mt={2}>
                                            Resolved at: {new Date(incident.dateResolved).toLocaleString()}
                                          </Text>
                                        )}
                                      </Box>
                                    </VStack>
                                  </SimpleGrid>
                                </Box>
                              </Collapse>
                            </Td>
                          </Tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
          )}

          {/* Pagination Footer */}
          {!loading && filteredIncidents.length > 0 && (
            <Flex
              justify="space-between"
              align="center"
              px={4}
              py={3}
              bg="var(--surface-alt)"
              borderTop="1px solid var(--rule)"
              wrap="wrap"
              gap={3}
            >
              <HStack spacing={2}>
                <Text fontSize="12px" color="#5C6675">
                  Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                </Text>
                <HStack spacing={1}>
                  <Button
                    size="xs"
                    variant="outline"
                    leftIcon={<FiChevronLeft />}
                    isDisabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    rightIcon={<FiChevronRight />}
                    isDisabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </HStack>
              </HStack>

              <HStack spacing={2}>
                <Text fontSize="12px" color="#5C6675">
                  Items per page:
                </Text>
                <Select
                  size="xs"
                  w="70px"
                  bg="var(--surface)"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </Select>
              </HStack>
            </Flex>
          )}
        </Box>
      </Box>
    </Box>
  );
};
