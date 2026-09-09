import { Box, HStack, Container, Stack, Text } from '@chakra-ui/react';

export function Footer() {
  return (
    <Box bg="var(--surface-alt)" color="var(--ink)" borderTop="1px solid var(--rule)">
      <Container
        as={Stack}
        maxW="1400px"
        py={5}
        direction={{ base: 'column', md: 'row' }}
        spacing={4}
        justify={{ base: 'center', md: 'space-between' }}
        align={{ base: 'flex-start', md: 'center' }}
      >
        <HStack spacing={2}>
          <Text fontSize="13px" fontWeight="600" color="var(--ink)">
            RAKSHA112
          </Text>
          <Text fontSize="12px" color="#717D8A">
            • Emergency Response Support System (ERSS-112) Dispatcher Tooling
          </Text>
        </HStack>
        <Text fontSize="12px" color="#717D8A">
          Academic College Simulation • Not connected to real 112 emergency network
        </Text>
      </Container>
    </Box>
  );
}
