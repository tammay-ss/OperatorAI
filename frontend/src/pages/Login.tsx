import React, { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  VStack,
  HStack,
  Text,
  Heading,
  Alert,
  AlertIcon,
  AlertDescription,
  Icon,
  Badge,
} from '@chakra-ui/react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { FiShield, FiArrowLeft } from 'react-icons/fi';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { signIn, signInDemo, user, error: authError, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const locationState = location.state as { from?: { pathname?: string } } | null;
  const from = locationState?.from?.pathname || '/dashboard';

  // If already logged in, redirect directly to dashboard
  React.useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim() || !password) {
      setLocalError('Please provide both operator email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const authErr = err as { message?: string };
      setLocalError(authErr.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || authError;

  return (
    <Box minH="100vh" bg="var(--surface)" color="var(--ink)" display="flex" flexDirection="column">
      {/* Header Bar */}
      <Box borderBottom="1px solid var(--rule)" px={{ base: 6, md: 12 }} py={4} bg="var(--surface)">
        <Box maxW="1200px" mx="auto">
          <HStack justify="space-between">
            <HStack spacing={3}>
              <Icon as={FiShield} w={5} h={5} color="var(--accent)" />
              <Text fontWeight="600" fontSize="15px" color="var(--ink)">
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
                Operator Gate
              </Badge>
            </HStack>

            <Button
              as={RouterLink}
              to="/"
              variant="ghost"
              size="sm"
              fontSize="13px"
              fontWeight="500"
              leftIcon={<FiArrowLeft size={13} />}
              _hover={{ bg: 'var(--surface-alt)' }}
            >
              Back to Overview
            </Button>
          </HStack>
        </Box>
      </Box>

      {/* Main Login Form Container */}
      <Box flex="1" display="flex" alignItems="center" justifyContent="center" px={6} py={12} bg="var(--surface-alt)">
        <Box
          w="full"
          maxW="420px"
          bg="var(--surface)"
          border="1px solid var(--rule)"
          p={{ base: 6, md: 8 }}
          borderRadius="2px"
        >
          <VStack align="flex-start" spacing={6} w="full">
            <Box>
              <Heading as="h1" fontSize="20px" fontWeight="600" color="var(--ink)" mb={1}>
                Operator Authentication
              </Heading>
              <Text fontSize="13px" color="#5C6675">
                Sign in with authorized ERSS-112 dispatcher credentials to view active incident queues.
              </Text>
            </Box>

            {displayError && (
              <Alert status="error" borderRadius="2px" py={2.5} px={3} bg="#FDEDED" border="1px solid #F5C2C7">
                <AlertIcon color="#B3261E" boxSize={4} />
                <AlertDescription fontSize="13px" color="#58151C">
                  {displayError}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} style={{ width: '100%' }}>
              <VStack spacing={4} align="stretch">
                <FormControl isRequired>
                  <FormLabel fontSize="13px" fontWeight="500" color="var(--ink)" mb={1}>
                    Operator Email
                  </FormLabel>
                  <Input
                    type="email"
                    placeholder="dispatcher@erss.gov.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    borderRadius="2px"
                    borderColor="var(--rule)"
                    fontSize="14px"
                    _focus={{ borderColor: 'var(--accent)', boxShadow: 'none' }}
                    autoComplete="username"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel fontSize="13px" fontWeight="500" color="var(--ink)" mb={1}>
                    Password
                  </FormLabel>
                  <Input
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    borderRadius="2px"
                    borderColor="var(--rule)"
                    fontSize="14px"
                    _focus={{ borderColor: 'var(--accent)', boxShadow: 'none' }}
                    autoComplete="current-password"
                  />
                </FormControl>

                <Button
                  type="submit"
                  w="full"
                  bg="var(--accent)"
                  color="white"
                  _hover={{ bg: 'var(--accent-hover)' }}
                  borderRadius="2px"
                  fontWeight="500"
                  fontSize="14px"
                  py={5}
                  mt={2}
                  isLoading={isSubmitting}
                  loadingText="Authenticating..."
                >
                  Sign In to Dispatcher Feed
                </Button>

                <Button
                  type="button"
                  w="full"
                  variant="outline"
                  borderColor="var(--accent)"
                  color="var(--accent)"
                  _hover={{ bg: 'var(--surface-alt)' }}
                  borderRadius="2px"
                  fontWeight="600"
                  fontSize="13px"
                  py={5}
                  onClick={() => {
                    signInDemo();
                    navigate(from, { replace: true });
                  }}
                >
                  ⚡ 1-Click Evaluation Sign In (Demo Mode)
                </Button>
              </VStack>
            </form>

            <Box borderTop="1px solid var(--rule)" pt={4} w="full">
              <Text fontSize="12px" color="#717D8A" lineHeight="1.5">
                Note: Dispatcher accounts are authenticated for ERSS-112 console access. Evaluators can use the 1-Click Demo button above for instant system evaluation.
              </Text>
            </Box>
          </VStack>
        </Box>
      </Box>

      {/* Footer */}
      <Box borderTop="1px solid var(--rule)" px={6} py={4} bg="var(--surface)">
        <Text fontSize="12px" color="#717D8A" textAlign="center">
          RAKSHA112 • Controlled Access Emergency Response Prototype
        </Text>
      </Box>
    </Box>
  );
};
