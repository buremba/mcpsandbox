import { tool } from "ai";
import { z } from "zod";

/**
 * Calculator tools for mathematical operations
 */

export const calculateFibonacciTool = tool({
	description:
		"Calculate the Fibonacci sequence up to n terms. Returns an array of Fibonacci numbers.",
	inputSchema: z.object({
		n: z.number().min(1).max(100).describe("The number of terms in the Fibonacci sequence (1-100)"),
	}),
	execute: async ({ n }) => {
		const fibonacci = (num: number): number[] => {
			if (num <= 0) return [];
			if (num === 1) return [0];
			if (num === 2) return [0, 1];

			const sequence = [0, 1];
			for (let i = 2; i < num; i++) {
				sequence.push(sequence[i - 1] + sequence[i - 2]);
			}
			return sequence;
		};

		const result = fibonacci(n);
		return {
			success: true,
			count: n,
			sequence: result,
			lastValue: result[result.length - 1],
			sum: result.reduce((acc, curr) => acc + curr, 0),
		};
	},
});

export const calculatePrimeTool = tool({
	description:
		"Check if a number is prime or find prime numbers up to a given limit.",
	inputSchema: z.object({
		mode: z.enum(["check", "generate"]).describe("'check' to test if a number is prime, 'generate' to find all primes up to a limit"),
		number: z.number().min(1).describe("The number to check or the upper limit for generation"),
	}),
	execute: async ({ mode, number }) => {
		const isPrime = (n: number): boolean => {
			if (n <= 1) return false;
			if (n <= 3) return true;
			if (n % 2 === 0 || n % 3 === 0) return false;

			for (let i = 5; i * i <= n; i += 6) {
				if (n % i === 0 || n % (i + 2) === 0) return false;
			}
			return true;
		};

		if (mode === "check") {
			return {
				success: true,
				number,
				isPrime: isPrime(number),
			};
		} else {
			const primes = [];
			for (let i = 2; i <= number; i++) {
				if (isPrime(i)) {
					primes.push(i);
				}
			}
			return {
				success: true,
				limit: number,
				primes,
				count: primes.length,
			};
		}
	},
});

export const calculateFactorialTool = tool({
	description:
		"Calculate the factorial of a number (n!). Limited to n <= 20 to avoid overflow.",
	inputSchema: z.object({
		n: z.number().min(0).max(20).describe("The number to calculate factorial for (0-20)"),
	}),
	execute: async ({ n }) => {
		const factorial = (num: number): number => {
			if (num === 0 || num === 1) return 1;
			let result = 1;
			for (let i = 2; i <= num; i++) {
				result *= i;
			}
			return result;
		};

		const result = factorial(n);
		return {
			success: true,
			input: n,
			factorial: result,
			formatted: `${n}! = ${result}`,
		};
	},
});

export const performCalculationTool = tool({
	description:
		"Perform basic mathematical calculations (addition, subtraction, multiplication, division, power, modulo).",
	inputSchema: z.object({
		operation: z.enum(["add", "subtract", "multiply", "divide", "power", "modulo"]).describe("The mathematical operation to perform"),
		a: z.number().describe("The first number"),
		b: z.number().describe("The second number"),
	}),
	execute: async ({ operation, a, b }) => {
		let result: number;
		let expression: string;

		switch (operation) {
			case "add":
				result = a + b;
				expression = `${a} + ${b}`;
				break;
			case "subtract":
				result = a - b;
				expression = `${a} - ${b}`;
				break;
			case "multiply":
				result = a * b;
				expression = `${a} × ${b}`;
				break;
			case "divide":
				if (b === 0) {
					return {
						success: false,
						error: "Division by zero",
						message: "Cannot divide by zero",
					};
				}
				result = a / b;
				expression = `${a} ÷ ${b}`;
				break;
			case "power":
				result = Math.pow(a, b);
				expression = `${a}^${b}`;
				break;
			case "modulo":
				if (b === 0) {
					return {
						success: false,
						error: "Modulo by zero",
						message: "Cannot perform modulo by zero",
					};
				}
				result = a % b;
				expression = `${a} mod ${b}`;
				break;
			default:
				return {
					success: false,
					error: "Unknown operation",
					message: `Unknown operation: ${operation}`,
				};
		}

		return {
			success: true,
			operation,
			a,
			b,
			result,
			expression: `${expression} = ${result}`,
		};
	},
});

/**
 * Export all calculator tools as a collection
 */
export const calculatorTools = {
	calculateFibonacci: calculateFibonacciTool,
	calculatePrime: calculatePrimeTool,
	calculateFactorial: calculateFactorialTool,
	performCalculation: performCalculationTool,
};