// frontend/src/components/SearchableSelect.tsx
import { useEffect, useState } from 'react';
import {
  Select,
  SelectList,
  SelectOption,
  MenuToggle,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
  Button,
} from '@patternfly/react-core';
import TimesIcon from '@patternfly/react-icons/dist/esm/icons/times-icon';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  ariaLabel: string;
  placeholder: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  isDisabled?: boolean;
}

/**
 * A single-select dropdown that lets the user type to filter/search a
 * potentially long option list (apiGroups, resources, verbs, ServiceAccounts,
 * etc. can all grow large on a real cluster). Selecting an option, clicking
 * elsewhere, or pressing Escape closes the list; typing re-opens it and
 * filters by a case-insensitive substring match against each option's label.
 */
export function SearchableSelect({ ariaLabel, placeholder, value, options, onChange, isDisabled }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');

  // If the controlled value changes from outside (parent reset it, or the
  // user picked a new option), drop any stale filter text so the next time
  // the list opens it starts unfiltered.
  useEffect(() => {
    setFilterText('');
  }, [value]);

  const selectedLabel = options.find((option) => option.value === value)?.label ?? '';
  const displayValue = isOpen ? filterText : selectedLabel;

  const normalizedFilter = filterText.trim().toLowerCase();
  const filteredOptions = normalizedFilter === ''
    ? options
    : options.filter((option) => option.label.toLowerCase().includes(normalizedFilter));

  const selectOption = (optionValue: string) => {
    onChange(optionValue);
    setFilterText('');
    setIsOpen(false);
  };

  const handleTextChange = (_event: React.FormEvent<HTMLInputElement>, text: string) => {
    setFilterText(text);
    setIsOpen(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (filteredOptions.length > 0) {
        selectOption(filteredOptions[0].value);
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <Select
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      selected={value}
      onSelect={(_event, selectedValue) => selectOption(String(selectedValue))}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          variant="typeahead"
          isExpanded={isOpen}
          isDisabled={isDisabled}
          onClick={() => setIsOpen((open) => !open)}
        >
          <TextInputGroup isPlain>
            <TextInputGroupMain
              value={displayValue}
              placeholder={placeholder}
              aria-label={ariaLabel}
              role="combobox"
              isExpanded={isOpen}
              onClick={() => setIsOpen(true)}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
            />
            {value && (
              <TextInputGroupUtilities>
                <Button
                  variant="plain"
                  aria-label={`clear ${ariaLabel}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange('');
                    setFilterText('');
                  }}
                >
                  <TimesIcon />
                </Button>
              </TextInputGroupUtilities>
            )}
          </TextInputGroup>
        </MenuToggle>
      )}
    >
      <SelectList>
        {filteredOptions.length === 0 ? (
          <SelectOption isDisabled>No results found</SelectOption>
        ) : (
          filteredOptions.map((option) => (
            <SelectOption key={option.value} value={option.value}>
              {option.label}
            </SelectOption>
          ))
        )}
      </SelectList>
    </Select>
  );
}
