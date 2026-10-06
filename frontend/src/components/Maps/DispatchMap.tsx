import React, { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Badge,
  Button,
  Select,
  Icon,
  Tooltip,
  useToast,
} from '@chakra-ui/react';
import {
  FiMapPin,
  FiMaximize2,
  FiCheckCircle,
  FiClock,
  FiAlertCircle,
  FiPhone,
  FiUser,
  FiCompass,
} from 'react-icons/fi';
import { CallData, EMERGENCIES, PRIORITIES, STATUSES } from '../../types/calls';

import 'leaflet/dist/leaflet.css';

interface DispatchMapProps {
  calls: CallData[];
  selectedCall?: CallData | null;
  onSelectCall?: (call: CallData) => void;
  onStatusChange?: (callSid: string, newStatus: string) => Promise<void>;
}

// Emergency Type Color Scheme
const EMERGENCY_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  'Medical Emergency': { bg: '#DC2626', border: '#991B1B', text: '#FFFFFF', icon: '🏥' },
  'Fire Emergency': { bg: '#EA580C', border: '#9A3412', text: '#FFFFFF', icon: '🔥' },
  'Traffic Accident': { bg: '#D97706', border: '#B45309', text: '#FFFFFF', icon: '🚗' },
  'Crime In Progress': { bg: '#7C3AED', border: '#5B21B6', text: '#FFFFFF', icon: '🚨' },
  'Natural Disaster': { bg: '#0D9488', border: '#0F766E', text: '#FFFFFF', icon: '🌊' },
  'Other Emergency': { bg: '#2563EB', border: '#1D4ED8', text: '#FFFFFF', icon: '⚠️' },
};

function getEmergencyConfig(call: CallData) {
  const emergencyType = call.emergency || call.emergency_type || 'Other Emergency';
  return (
    EMERGENCY_COLORS[emergencyType] || {
      bg: '#2563EB',
      border: '#1D4ED8',
      text: '#FFFFFF',
      icon: '⚠️',
    }
  );
}

// Custom Leaflet DivIcon with pulsing radar for high priority
function createEmergencyIcon(call: CallData, isSelected: boolean) {
  const config = getEmergencyConfig(call);
  const isHighPriority = call.priority === 'HIGH' && call.status === 'OPEN';
  const isResolved = call.status === 'RESOLVED';

  const pulseHtml = isHighPriority
    ? `<span class="emergency-pulse" style="border-color: ${config.bg};"></span>`
    : '';

  const selectionRing = isSelected
    ? `<span class="emergency-selected-ring"></span>`
    : '';

  const opacityStyle = isResolved ? 'opacity: 0.45; filter: grayscale(80%);' : '';

  const html = `
    <div class="emergency-marker-wrapper" style="${opacityStyle}">
      ${pulseHtml}
      ${selectionRing}
      <div class="emergency-marker-pin" style="background-color: ${config.bg}; border-color: ${config.border};">
        <span class="emergency-marker-icon">${config.icon}</span>
      </div>
      <div class="emergency-marker-badge">${call.incident_id || 'INC'}</div>
    </div>
  `;

  return L.divIcon({
    className: 'custom-emergency-div-icon',
    html,
    iconSize: [36, 46],
    iconAnchor: [18, 42],
    popupAnchor: [0, -38],
  });
}

// Map Controller for zooming and panning
const MapController: React.FC<{
  center: [number, number];
  zoom: number;
  bounds?: L.LatLngBoundsExpression | null;
}> = ({ center, zoom, bounds }) => {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (center) {
      map.setView(center, zoom, { animate: true });
    }
  }, [map, center, zoom, bounds]);

  return null;
};

export const DispatchMap: React.FC<DispatchMapProps> = ({
  calls,
  selectedCall,
  onSelectCall,
  onStatusChange,
}) => {
  const toast = useToast();
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('OPEN_ONLY');
  const [targetBounds, setTargetBounds] = useState<L.LatLngBoundsExpression | null>(null);

  // Extract coordinates from call record (supports lat/lng or geocode)
  const getCallCoords = (call: CallData): [number, number] | null => {
    const lat = call.latitude ?? call.geocode?.lat;
    const lng = call.longitude ?? call.geocode?.lng;
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      return [lat, lng];
    }
    return null;
  };

  // Filter calls with valid geographic coordinates
  const mappedCalls = useMemo(() => {
    return calls.filter((call) => {
      const coords = getCallCoords(call);
      if (!coords) return false;

      // Status filter
      if (statusFilter === 'OPEN_ONLY' && call.status !== 'OPEN') return false;
      if (statusFilter === 'UNRESOLVED' && call.status === 'RESOLVED') return false;

      // Priority filter
      if (priorityFilter !== 'ALL' && call.priority !== priorityFilter) return false;

      // Category filter
      if (categoryFilter !== 'ALL') {
        const cat = call.emergency || call.emergency_type;
        if (cat !== categoryFilter) return false;
      }

      return true;
    });
  }, [calls, statusFilter, priorityFilter, categoryFilter]);

  // Center coordinate determination: Selected Call > First Mapped Call > Chennai Central default
  const mapCenter: [number, number] = useMemo(() => {
    if (selectedCall) {
      const coords = getCallCoords(selectedCall);
      if (coords) return coords;
    }
    if (mappedCalls.length > 0) {
      const first = getCallCoords(mappedCalls[0]);
      if (first) return first;
    }
    return [13.0827, 80.2755]; // Chennai Central / India Regional Center
  }, [selectedCall, mappedCalls]);

  const mapZoom = selectedCall ? 14 : mappedCalls.length > 1 ? 7 : 11;

  // Fit all active emergencies onto viewport
  const handleFitAll = () => {
    if (mappedCalls.length === 0) {
      toast({
        title: 'No Matching Emergencies',
        description: 'No active incidents match current filter criteria.',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const bounds = L.latLngBounds(
      mappedCalls.map((call) => {
        const [lat, lng] = getCallCoords(call)!;
        return [lat, lng];
      })
    );
    setTargetBounds(bounds);
    setTimeout(() => setTargetBounds(null), 1000);
  };

  // Quick regional jump
  const handleQuickJump = (lat: number, lng: number, zoomLevel: number) => {
    setTargetBounds(null);
    setTargetBounds(L.latLngBounds([[lat - 0.1, lng - 0.1], [lat + 0.1, lng + 0.1]]));
    setTimeout(() => setTargetBounds(null), 800);
  };

  const handleUpdateStatus = async (callSid: string, newStatus: string) => {
    if (onStatusChange) {
      try {
        await onStatusChange(callSid, newStatus);
        toast({
          title: `Incident ${newStatus}`,
          description: `Updated status for ${callSid} to ${newStatus}.`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } catch (err) {
        toast({
          title: 'Update Failed',
          description: 'Could not update incident status.',
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      }
    }
  };

  return (
    <Box className="raksha-dispatch-map-container" w="full">
      {/* Map Control Toolbar */}
      <Flex
        bg="var(--surface)"
        border="1px solid var(--rule)"
        borderBottom="none"
        p={3}
        wrap="wrap"
        gap={3}
        align="center"
        justify="space-between"
      >
        <HStack spacing={3} wrap="wrap">
          <HStack spacing={1}>
            <Icon as={FiMapPin} color="var(--accent)" />
            <Text fontSize="13px" fontWeight="600" color="var(--ink)">
              Open Emergencies:
            </Text>
            <Badge
              colorScheme={mappedCalls.length > 0 ? 'red' : 'gray'}
              fontSize="12px"
              borderRadius="2px"
              px={2}
            >
              {mappedCalls.length} Markers on Map
            </Badge>
          </HStack>

          {/* Status Filter */}
          <Select
            size="xs"
            w="140px"
            borderRadius="2px"
            borderColor="var(--rule)"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="OPEN_ONLY">Open Emergencies</option>
            <option value="UNRESOLVED">Open + Dispatched</option>
            <option value="ALL">Show All Incidents</option>
          </Select>

          {/* Emergency Type Filter */}
          <Select
            size="xs"
            w="160px"
            borderRadius="2px"
            borderColor="var(--rule)"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="ALL">All Emergency Types</option>
            {Object.keys(EMERGENCIES).map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </Select>

          {/* Priority Filter */}
          <Select
            size="xs"
            w="120px"
            borderRadius="2px"
            borderColor="var(--rule)"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="ALL">All Priorities</option>
            <option value="HIGH">High Priority</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="LOW">Low Priority</option>
          </Select>
        </HStack>

        {/* Quick Nav Tools */}
        <HStack spacing={2}>
          <Tooltip label="Fit bounds to display all active emergencies simultaneously">
            <Button
              size="xs"
              leftIcon={<FiMaximize2 />}
              variant="outline"
              borderColor="var(--rule)"
              borderRadius="2px"
              fontSize="11px"
              onClick={handleFitAll}
            >
              Fit All Incidents
            </Button>
          </Tooltip>

          <Button
            size="xs"
            variant="ghost"
            fontSize="11px"
            borderRadius="2px"
            onClick={() => handleQuickJump(13.0827, 80.2755, 12)}
          >
            Chennai Hub
          </Button>
          <Button
            size="xs"
            variant="ghost"
            fontSize="11px"
            borderRadius="2px"
            onClick={() => handleQuickJump(28.6139, 77.2090, 11)}
          >
            Delhi NCR
          </Button>
          <Button
            size="xs"
            variant="ghost"
            fontSize="11px"
            borderRadius="2px"
            onClick={() => handleQuickJump(12.9716, 77.5946, 12)}
          >
            Bengaluru
          </Button>
        </HStack>
      </Flex>

      {/* Interactive Leaflet Map Viewport */}
      <Box
        id="leaflet-dispatch-map"
        w="full"
        h={{ base: '380px', lg: '460px' }}
        border="1px solid var(--rule)"
        position="relative"
      >
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', backgroundColor: '#f8fafc' }}
        >
          {/* OpenStreetMap Standard Tiles (No billing / API key required) */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapController center={mapCenter} zoom={mapZoom} bounds={targetBounds} />

          {/* Render markers for every open/matched incident */}
          {mappedCalls.map((call) => {
            const coords = getCallCoords(call);
            if (!coords) return null;

            const isSelected = selectedCall?.callSid === call.callSid;
            const config = getEmergencyConfig(call);
            const entities = call.entities || {};

            return (
              <Marker
                key={call.callSid || call.key}
                position={coords}
                icon={createEmergencyIcon(call, isSelected)}
                eventHandlers={{
                  click: () => {
                    if (onSelectCall) onSelectCall(call);
                  },
                }}
              >
                <Popup className="raksha-custom-leaflet-popup" maxWidth={340} minWidth={280}>
                  <Box p={2}>
                    {/* Header */}
                    <Flex justify="space-between" align="center" mb={2}>
                      <HStack spacing={1}>
                        <Text fontSize="16px">{config.icon}</Text>
                        <Text fontWeight="700" fontSize="13px" color="#111827">
                          {call.incident_id || call.callSid}
                        </Text>
                      </HStack>
                      <HStack spacing={1}>
                        <Badge
                          fontSize="10px"
                          px={1.5}
                          py={0.5}
                          borderRadius="2px"
                          colorScheme={PRIORITIES?.[call.priority]?.color || 'red'}
                        >
                          {call.priority}
                        </Badge>
                        <Badge
                          fontSize="10px"
                          px={1.5}
                          py={0.5}
                          borderRadius="2px"
                          colorScheme={STATUSES?.[call.status]?.color || 'blue'}
                        >
                          {call.status}
                        </Badge>
                      </HStack>
                    </Flex>

                    {/* Emergency Category */}
                    <Text fontSize="12px" fontWeight="600" color={config.bg} mb={1}>
                      {call.emergency || call.emergency_type || 'Unclassified Emergency'}
                    </Text>

                    {/* Location Information */}
                    <Box bg="#F3F4F6" p={2} borderRadius="3px" mb={2} fontSize="11px">
                      <Flex align="center" gap={1} mb={0.5}>
                        <Icon as={FiMapPin} color="#DC2626" />
                        <Text fontWeight="600" color="#1F2937">
                          {call.location_text || call.location || 'Spoken Address'}
                        </Text>
                      </Flex>
                      <Text color="#4B5563" fontSize="10px">
                        {call.formattedAddress || 'India Regional Location'}
                      </Text>
                      <HStack justify="space-between" mt={1} pt={1} borderTop="1px dashed #D1D5DB">
                        <Text fontSize="9px" color="#6B7280">
                          Source: <strong>Caller Statement</strong>
                        </Text>
                        <Text fontSize="9px" color="#6B7280">
                          {coords[0].toFixed(5)}, {coords[1].toFixed(5)}
                        </Text>
                      </HStack>
                    </Box>

                    {/* Caller & Time */}
                    <VStack align="stretch" spacing={1} mb={2} fontSize="11px" color="#374151">
                      <Flex justify="space-between">
                        <HStack spacing={1}>
                          <Icon as={FiUser} color="#6B7280" />
                          <Text color="#6B7280">Caller:</Text>
                        </HStack>
                        <Text fontWeight="600">{call.name}</Text>
                      </Flex>
                      <Flex justify="space-between">
                        <HStack spacing={1}>
                          <Icon as={FiPhone} color="#6B7280" />
                          <Text color="#6B7280">Contact:</Text>
                        </HStack>
                        <Text fontWeight="500">{call.phone}</Text>
                      </Flex>
                      <Flex justify="space-between">
                        <HStack spacing={1}>
                          <Icon as={FiClock} color="#6B7280" />
                          <Text color="#6B7280">Logged:</Text>
                        </HStack>
                        <Text>
                          {new Date(call.dateCreated || call.timestamp || Date.now()).toLocaleTimeString()}
                        </Text>
                      </Flex>
                    </VStack>

                    {/* Extracted Structured Entities Summary */}
                    {(entities.victims !== undefined || (entities.injuries && entities.injuries.length > 0) || entities.landmark) && (
                      <Box mb={2} p={1.5} bg="#EFF6FF" borderRadius="3px" fontSize="10px">
                        <Text fontWeight="700" color="#1E40AF" mb={1}>
                          AI Extracted Details:
                        </Text>
                        <Flex wrap="wrap" gap={1}>
                          {entities.victims !== undefined && (
                            <Badge colorScheme="red" fontSize="9px">
                              Victims: {entities.victims}
                            </Badge>
                          )}
                          {entities.injuries?.map((inj, i) => (
                            <Badge key={i} colorScheme="red" variant="outline" fontSize="9px">
                              {inj}
                            </Badge>
                          ))}
                          {entities.landmark && (
                            <Badge colorScheme="green" fontSize="9px">
                              Landmark: {entities.landmark}
                            </Badge>
                          )}
                        </Flex>
                      </Box>
                    )}

                    {/* Transcript Excerpt */}
                    {call.transcript && (
                      <Box mb={3} p={1.5} bg="#FFFFFF" border="1px solid #E5E7EB" borderRadius="2px">
                        <Text fontSize="9px" color="#9CA3AF" fontWeight="600" mb={0.5}>
                          TRANSCRIPT SNIPPET:
                        </Text>
                        <Text fontSize="10px" color="#374151" fontStyle="italic" noOfLines={2}>
                          &quot;{call.transcript}&quot;
                        </Text>
                      </Box>
                    )}

                    {/* Operational Action Buttons */}
                    <HStack spacing={2} justify="stretch">
                      {call.status === 'OPEN' && (
                        <Button
                          size="xs"
                          colorScheme="orange"
                          fontSize="10px"
                          flex={1}
                          onClick={() => handleUpdateStatus(call.callSid, 'DISPATCHED')}
                        >
                          Dispatch Units
                        </Button>
                      )}
                      {call.status !== 'RESOLVED' && (
                        <Button
                          size="xs"
                          colorScheme="green"
                          fontSize="10px"
                          flex={1}
                          onClick={() => handleUpdateStatus(call.callSid, 'RESOLVED')}
                        >
                          Mark Resolved
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="outline"
                        fontSize="10px"
                        flex={1}
                        onClick={() => {
                          if (onSelectCall) onSelectCall(call);
                          document
                            .querySelector('#calls-section')
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                      >
                        View Ticket
                      </Button>
                    </HStack>
                  </Box>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </Box>

      {/* Map Legend Bar */}
      <Flex
        bg="var(--surface)"
        border="1px solid var(--rule)"
        borderTop="none"
        p={2.5}
        justify="space-between"
        align="center"
        wrap="wrap"
        gap={2}
        fontSize="11px"
      >
        <HStack spacing={4} wrap="wrap">
          <Text fontWeight="600" color="#5C6675">
            Emergency Legend:
          </Text>
          <HStack spacing={1}>
            <Box w="10px" h="10px" borderRadius="full" bg="#DC2626" />
            <Text color="var(--ink)">Medical</Text>
          </HStack>
          <HStack spacing={1}>
            <Box w="10px" h="10px" borderRadius="full" bg="#EA580C" />
            <Text color="var(--ink)">Fire</Text>
          </HStack>
          <HStack spacing={1}>
            <Box w="10px" h="10px" borderRadius="full" bg="#D97706" />
            <Text color="var(--ink)">Accident</Text>
          </HStack>
          <HStack spacing={1}>
            <Box w="10px" h="10px" borderRadius="full" bg="#7C3AED" />
            <Text color="var(--ink)">Police / Crime</Text>
          </HStack>
          <HStack spacing={1}>
            <Box w="10px" h="10px" borderRadius="full" bg="#2563EB" />
            <Text color="var(--ink)">Other Hazard</Text>
          </HStack>
        </HStack>

        <Text color="#5C6675" fontSize="10px">
          * Location extracted from spoken transcript via Indic NLP &amp; Nominatim/Local Geocoding
        </Text>
      </Flex>
    </Box>
  );
};
