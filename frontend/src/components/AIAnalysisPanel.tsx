import React from 'react';
import {
  Box,
  Text,
  Badge,
  VStack,
  HStack,
  Flex,
  Progress,
  Wrap,
  WrapItem,
  Tooltip,
  Icon,
} from '@chakra-ui/react';
import { FiCpu, FiMapPin, FiAlertTriangle, FiUser, FiTruck, FiShield } from 'react-icons/fi';
import { CallData, EMERGENCIES } from '../types/calls';

interface AIAnalysisPanelProps {
  data: CallData;
}

const ConfidenceBar: React.FC<{ label: string; score: number; isTop?: boolean }> = ({ label, score, isTop }) => {
  const pct = Math.round(score * 100);
  return (
    <Box w="full">
      <Flex justify="space-between" mb={1}>
        <Text fontSize="11px" fontWeight={isTop ? '700' : '500'} color={isTop ? 'var(--ink)' : '#5C6675'}>
          {label}
        </Text>
        <Text fontSize="11px" fontWeight="600" color={isTop ? 'var(--accent)' : '#5C6675'}>
          {pct}%
        </Text>
      </Flex>
      <Progress
        value={pct}
        size="xs"
        borderRadius="full"
        colorScheme={isTop ? 'blue' : 'gray'}
        bg="var(--rule)"
      />
    </Box>
  );
};

export const AIAnalysisPanel: React.FC<AIAnalysisPanelProps> = ({ data }) => {
  const hasEntities = data.entities && Object.keys(data.entities).length > 0;
  const hasScores = data.classificationScores && Object.keys(data.classificationScores).length > 0;

  const emergencyInfo = data.emergency ? EMERGENCIES[data.emergency as keyof typeof EMERGENCIES] : null;

  return (
    <VStack spacing={4} align="stretch" w="full">
      {/* Classification Result */}
      <Box bg="var(--surface)" border="1px solid var(--rule)" borderRadius="4px" p={4}>
        <Flex align="center" mb={3}>
          <Icon as={FiCpu} color="var(--accent)" mr={2} />
          <Text fontSize="13px" fontWeight="700" color="var(--ink)">
            AI Classification
          </Text>
          {data.processingStatus && (
            <Badge
              ml="auto"
              fontSize="10px"
              borderRadius="2px"
              colorScheme={data.processingStatus === 'completed' ? 'green' : 'blue'}
            >
              {data.processingStatus === 'completed' ? '✓ Processed' : data.processingStatus}
            </Badge>
          )}
        </Flex>

        {data.emergency ? (
          <Flex align="center" gap={3} mb={3}>
            <Text fontSize="20px">{emergencyInfo?.icon || '⚠️'}</Text>
            <Box>
              <Text fontSize="15px" fontWeight="700" color="var(--ink)">
                {data.emergency}
              </Text>
              {data.confidence !== undefined && (
                <Text fontSize="12px" color="#5C6675">
                  Confidence: <strong>{Math.round(data.confidence * 100)}%</strong>
                  {data.confidence >= 0.7 ? ' (High)' : data.confidence >= 0.4 ? ' (Moderate)' : ' (Low)'}
                </Text>
              )}
            </Box>
          </Flex>
        ) : (
          <Text fontSize="13px" color="#5C6675" fontStyle="italic">
            Classification pending...
          </Text>
        )}

        {/* Classification Scores Breakdown */}
        {hasScores && (
          <VStack spacing={2} mt={2}>
            {Object.entries(data.classificationScores!)
              .sort(([, a], [, b]) => b - a)
              .map(([label, score], idx) => (
                <ConfidenceBar key={label} label={label} score={score} isTop={idx === 0} />
              ))}
          </VStack>
        )}
      </Box>

      {/* Extracted Entities */}
      {hasEntities && (
        <Box bg="var(--surface)" border="1px solid var(--rule)" borderRadius="4px" p={4}>
          <Flex align="center" mb={3}>
            <Icon as={FiAlertTriangle} color="var(--accent)" mr={2} />
            <Text fontSize="13px" fontWeight="700" color="var(--ink)">
              Extracted Entities
            </Text>
          </Flex>

          <VStack spacing={2} align="stretch">
            {data.entities!.victims !== undefined && (
              <EntityRow
                icon={FiUser}
                label="Victims / People"
                value={String(data.entities!.victims)}
                colorScheme="red"
              />
            )}

            {data.entities!.injuries && data.entities!.injuries.length > 0 && (
              <EntityTagRow label="Injuries" tags={data.entities!.injuries} colorScheme="red" />
            )}

            {data.entities!.medicalConditions && data.entities!.medicalConditions.length > 0 && (
              <EntityTagRow label="Medical Conditions" tags={data.entities!.medicalConditions} colorScheme="purple" />
            )}

            {data.entities!.weapons && data.entities!.weapons.length > 0 && (
              <EntityTagRow label="Weapons" tags={data.entities!.weapons} colorScheme="red" />
            )}

            {data.entities!.vehicles && data.entities!.vehicles.length > 0 && (
              <EntityTagRow label="Vehicles" tags={data.entities!.vehicles} colorScheme="blue" />
            )}

            {data.entities!.licensePlate && (
              <EntityRow icon={FiTruck} label="License Plate" value={data.entities!.licensePlate} colorScheme="gray" />
            )}

            {data.entities!.suspectInfo && (
              <EntityRow
                icon={FiShield}
                label="Suspect Info"
                value={data.entities!.suspectInfo}
                colorScheme="orange"
              />
            )}

            {data.entities!.landmark && (
              <EntityRow icon={FiMapPin} label="Landmark" value={data.entities!.landmark} colorScheme="green" />
            )}

            {data.entities!.callerPhone && (
              <EntityRow icon={FiUser} label="Phone Detected" value={data.entities!.callerPhone} colorScheme="blue" />
            )}
          </VStack>
        </Box>
      )}

      {/* Caller Location Status */}
      {data.callerLocation && (
        <Box bg="var(--surface)" border="1px solid var(--rule)" borderRadius="4px" p={4}>
          <Flex align="center" mb={3}>
            <Icon as={FiMapPin} color={data.callerLocation.active ? 'green.500' : 'gray.500'} mr={2} />
            <Text fontSize="13px" fontWeight="700" color="var(--ink)">
              Caller GPS Location
            </Text>
            <Badge
              ml="auto"
              fontSize="10px"
              borderRadius="2px"
              colorScheme={data.callerLocation.active ? 'green' : 'gray'}
            >
              {data.callerLocation.active ? '● Live' : '○ Stopped'}
            </Badge>
          </Flex>

          <VStack spacing={1} align="stretch">
            <HStack justify="space-between">
              <Text fontSize="12px" color="#5C6675">
                Latitude
              </Text>
              <Text fontSize="12px" fontWeight="600">
                {data.callerLocation.latitude.toFixed(6)}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="12px" color="#5C6675">
                Longitude
              </Text>
              <Text fontSize="12px" fontWeight="600">
                {data.callerLocation.longitude.toFixed(6)}
              </Text>
            </HStack>
            {data.callerLocation.accuracy && (
              <HStack justify="space-between">
                <Text fontSize="12px" color="#5C6675">
                  Accuracy
                </Text>
                <Text fontSize="12px" fontWeight="600">
                  {Math.round(data.callerLocation.accuracy)} m
                </Text>
              </HStack>
            )}
            <HStack justify="space-between">
              <Text fontSize="12px" color="#5C6675">
                Last Update
              </Text>
              <Tooltip label={data.callerLocation.timestamp}>
                <Text fontSize="12px" fontWeight="600">
                  {getTimeAgo(data.callerLocation.timestamp)}
                </Text>
              </Tooltip>
            </HStack>
          </VStack>
        </Box>
      )}
    </VStack>
  );
};

// Helper components

const EntityRow: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  colorScheme: string;
}> = ({ icon: IconComponent, label, value, colorScheme }) => (
  <Flex align="center" gap={2} py={1}>
    <Icon as={IconComponent} color={`${colorScheme}.500`} w={3.5} h={3.5} />
    <Text fontSize="12px" color="#5C6675" minW="120px">
      {label}
    </Text>
    <Text fontSize="12px" fontWeight="600" color="var(--ink)">
      {value}
    </Text>
  </Flex>
);

const EntityTagRow: React.FC<{
  label: string;
  tags: string[];
  colorScheme: string;
}> = ({ label, tags, colorScheme }) => (
  <Box py={1}>
    <Text fontSize="12px" color="#5C6675" mb={1}>
      {label}
    </Text>
    <Wrap spacing={1}>
      {tags.map((tag, idx) => (
        <WrapItem key={idx}>
          <Badge fontSize="10px" colorScheme={colorScheme} borderRadius="2px" textTransform="capitalize">
            {tag}
          </Badge>
        </WrapItem>
      ))}
    </Wrap>
  </Box>
);

function getTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 5) return 'Just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return new Date(timestamp).toLocaleTimeString();
}
