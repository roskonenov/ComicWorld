import { useState } from "react";

export default function usePersistedState(keyWord, initialValue) {
    const [state, setState] = useState(() => {
        const persistedState = localStorage.getItem(keyWord);
        if (persistedState === 'undefined' || !persistedState) {
            return initialValue;
        }

        return JSON.parse(persistedState);
    });

    function setPersistedState(value) {
        localStorage.setItem(keyWord, JSON.stringify(value));
        setState(value)
    };

    return [state, setPersistedState];
}