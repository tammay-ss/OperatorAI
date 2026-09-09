import { Box, Flex, Stat, StatLabel, StatNumber, StatProps } from '@chakra-ui/react';
import { ReactNode } from 'react';

interface StatsCardProps extends StatProps {
  title: string;
  stat: string;
  icon: ReactNode;
  active: boolean;
}

export const StatsCard = (props: StatsCardProps) => {
  const { title, stat, icon, active, ...rest } = props;
  return (
    <Stat
      cursor="pointer"
      px={{ base: 3, md: 4 }}
      py={3}
      borderRadius="2px"
      bg={active ? 'var(--surface-alt)' : 'var(--surface)'}
      border="1px solid"
      borderColor={active ? 'var(--accent)' : 'var(--rule)'}
      transition="all 0.15s ease"
      _hover={{ borderColor: 'var(--accent)' }}
      {...rest}
    >
      <Flex alignItems="center" justify="space-between">
        <Box>
          <StatLabel fontSize="12px" fontWeight="500" color="#5C6675" mb={1}>
            {title}
          </StatLabel>
          <StatNumber fontSize="22px" fontWeight="600" color="var(--ink)">
            {stat}
          </StatNumber>
        </Box>
        <Box color="var(--accent)" opacity={0.85}>
          {icon}
        </Box>
      </Flex>
    </Stat>
  );
};
