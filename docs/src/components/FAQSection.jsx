import React, { useState } from 'react';
import './FAQSection.css';

const FAQItem = ({ question, answer, comparison }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={`faq-item ${isOpen ? 'open' : ''}`}>
            <button className="faq-question" onClick={() => setIsOpen(!isOpen)}>
                <span>{question}</span>
                <span className="faq-icon">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && (
                <div className="faq-answer">
                    {comparison ? comparison : <p>{answer}</p>}
                </div>
            )}
        </div>
    );
};

const FAQSection = () => {
    return (
        <section id="faq" className="faq-section">
            <h2>Frequently Asked Questions</h2>

            <div className="faq-grid">
                <FAQItem
                    question="How is 1mcp different from Anthropic's code execution approach?"
                    answer={
                        <>
                            <p>We're actually <strong>complementary</strong> to Anthropic's approach! In their <a href="https://www.anthropic.com/engineering/code-execution-with-mcp" target="_blank" rel="noopener noreferrer">blog post about code execution with MCP</a>, Anthropic shows how chaining tool calls in code reduces token usage by up to 96% compared to sequential tool calls.</p>
                            <p><strong>The challenge:</strong> Their example requires custom Cloudflare Workers integration per project. <strong>Our solution:</strong> 1mcp provides the same 96% token reduction out-of-the-box for ANY MCP server, with:</p>
                            <ul>
                                <li>✅ Zero config - works with any MCP server immediately</li>
                                <li>✅ Standardized tooling (run_js, read, write, search)</li>
                                <li>✅ Browser OR server-side execution (not just edge)</li>
                                <li>✅ Built-in policy enforcement and sandboxing</li>
                                <li>✅ No custom workers needed per integration</li>
                            </ul>
                            <p>Think of it as: Anthropic proved the pattern saves 96% tokens, we made it universally accessible.</p>
                        </>
                    }
                />

                <FAQItem
                    question="1mcp vs Cloudflare Workers / Vercel Functions?"
                    comparison={
                        <div className="comparison-table-wrapper">
                            <table className="comparison-table">
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th>1mcp</th>
                                        <th>Cloudflare Workers</th>
                                        <th>Vercel Functions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td><strong>Setup</strong></td>
                                        <td className="good">✅ Zero config</td>
                                        <td className="bad">❌ Provider-specific SDK</td>
                                        <td className="bad">❌ Provider-specific SDK</td>
                                    </tr>
                                    <tr>
                                        <td><strong>MCP Integration</strong></td>
                                        <td className="good">✅ Native (auto-proxy)</td>
                                        <td className="bad">❌ Manual per-tool</td>
                                        <td className="bad">❌ Manual per-tool</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Execution</strong></td>
                                        <td className="good">✅ Browser OR server</td>
                                        <td className="neutral">🟡 Edge only</td>
                                        <td className="neutral">🟡 Server only</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Policy Control</strong></td>
                                        <td className="good">✅ Per-session</td>
                                        <td className="neutral">🟡 Global project</td>
                                        <td className="neutral">🟡 Global project</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Cold Start</strong></td>
                                        <td className="good">✅ Instant (WASM)</td>
                                        <td className="neutral">🟡 50-200ms</td>
                                        <td className="bad">❌ 200ms-2s</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Cost (1M exec)</strong></td>
                                        <td className="good">✅ $0 (self-hosted)</td>
                                        <td className="neutral">💰 ~$5-15</td>
                                        <td className="neutral">💰 ~$10-30</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    }
                />

                <FAQItem
                    question="1mcp vs E2B / Daytona sandboxes?"
                    comparison={
                        <div className="comparison-grid">
                            <div className="comparison-column">
                                <h4>E2B / Daytona</h4>
                                <ul>
                                    <li>Full Docker/VM containers (100MB-1GB+)</li>
                                    <li>Spin-up time: 100ms-2s (optimized) to 5s+ (full containers)</li>
                                    <li><strong>Great for:</strong> Running entire apps, databases, full OS access, persistent environments</li>
                                    <li><strong>Cost:</strong> $0.05-0.50 per hour (usage-based)</li>
                                </ul>
                            </div>
                            <div className="comparison-column">
                                <h4>1mcp</h4>
                                <ul>
                                    <li>WASM sandbox (~2-5MB)</li>
                                    <li>Spin-up time: &lt;10ms</li>
                                    <li><strong>Great for:</strong> Chained tool calls, data processing, API orchestration, session-scoped execution</li>
                                    <li><strong>Cost:</strong> Free (self-hosted) or minimal compute ($0.001-0.01/hr on cloud)</li>
                                </ul>
                            </div>
                            <div className="comparison-recommendation">
                                <p><strong>Use 1mcp when:</strong> You need fast, cheap execution for MCP tool chains</p>
                                <p><strong>Use E2B/Daytona when:</strong> You need full OS access or long-running processes and you need more than Javascript</p>
                            </div>
                        </div>
                    }
                />

                <FAQItem
                    question="Is browser execution safe? What about malicious code?"
                    answer="Yes. Multiple security layers protect against malicious code: (1) Signed Capsules - server cryptographically signs all code, (2) WASM Sandbox - code runs in isolated QuickJS WASM runtime, (3) Policy Enforcement - network/filesystem access strictly limited, (4) No eval() - code is pre-compiled, no dynamic eval, (5) CSP Headers - Content Security Policy prevents injection. Malicious code cannot access parent page DOM, make arbitrary network requests, read/write host filesystem, or spawn processes."
                />

                <FAQItem
                    question="What happens when code execution fails?"
                    answer="1mcp has built-in retry and error handling: Network timeouts auto-retry with exponential backoff, memory limits trigger graceful shutdown with error details, policy violations return clear error messages explaining the violation, and runtime errors provide full stack traces to the agent. Agents can catch errors and retry with different approaches."
                />

                <FAQItem
                    question="Performance: How fast is code execution?"
                    comparison={
                        <div className="performance-comparison">
                            <div className="perf-section">
                                <h4>Server-side (Node.js QuickJS)</h4>
                                <ul>
                                    <li>Cold start: &lt;10ms</li>
                                    <li>Execution: ~1.2x slower than native Node.js</li>
                                    <li><strong>Best for:</strong> complex logic, heavy npm dependencies</li>
                                </ul>
                            </div>
                            <div className="perf-section">
                                <h4>Browser (WASM Worker)</h4>
                                <ul>
                                    <li>Cold start: &lt;5ms (already loaded)</li>
                                    <li>Execution: ~1.5-2x slower than native JS</li>
                                    <li><strong>Best for:</strong> offloading compute, real-time user interactions</li>
                                </ul>
                            </div>
                            <div className="perf-note">
                                <p>Both are significantly faster than:</p>
                                <ul>
                                    <li>Traditional MCP tool chains (10+ round trips eliminated)</li>
                                    <li>Container-based sandboxes (2-5s cold start vs &lt;10ms)</li>
                                </ul>
                            </div>
                        </div>
                    }
                />

                <FAQItem
                    question="What's the difference between browser and server execution?"
                    answer="Both use WASM sandboxing with the same security policies. Browser execution offloads compute to the client (free for you, uses client's CPU). Server execution runs on your infrastructure (more control, better for sensitive data). You can configure which execution mode to use per session, or let agents choose dynamically."
                />
            </div>
        </section>
    );
};

export default FAQSection;
