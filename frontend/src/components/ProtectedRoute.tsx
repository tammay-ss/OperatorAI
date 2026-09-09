import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { Flex, Spinner, Text, VStack } from '@chakra-ui/react';

export const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Flex minH="100vh" align="center" justify="center" bg="var(--surface)">
        <VStack spacing={4}>
          <Spinner size="md" thickness="2px" speed="0.8s" color="var(--accent)" />
          <Text fontSize="13px" color="var(--ink)" letterSpacing="0.02em">
            Verifying operator authorization...
          </Text>
        </VStack>
      </Flex>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};
